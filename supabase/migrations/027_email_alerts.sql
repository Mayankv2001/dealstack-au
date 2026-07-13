-- DealStack AU — email-only, double-opt-in alert lifecycle
--
-- NOT APPLIED TO PRODUCTION. Requires explicit schema, privacy and delivery
-- approval. No schedule or provider is enabled by this migration.

create table if not exists public.email_alert_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  email                    text not null check (email = lower(btrim(email)) and char_length(email) between 3 and 254),
  criteria_kind            text not null check (criteria_kind in ('store', 'gift-card-brand', 'programme', 'expiring-soon')),
  criteria_key             text,
  status                   text not null default 'pending' check (status in ('pending', 'active', 'unsubscribed', 'bounced')),
  confirmation_token_hash  text not null,
  unsubscribe_token_hash   text not null,
  request_fingerprint      text not null,
  consent_version          text not null default '2026-07-13',
  requested_at             timestamptz not null default now(),
  confirmed_at             timestamptz,
  unsubscribed_at          timestamptz,
  last_sent_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check ((criteria_kind = 'expiring-soon' and criteria_key is null) or
         (criteria_kind <> 'expiring-soon' and nullif(btrim(criteria_key), '') is not null))
);

create unique index if not exists idx_email_alert_one_live_subscription
  on public.email_alert_subscriptions (email, criteria_kind, coalesce(criteria_key, ''))
  where status in ('pending', 'active');
create index if not exists idx_email_alert_confirmation
  on public.email_alert_subscriptions (confirmation_token_hash) where status = 'pending';
create index if not exists idx_email_alert_unsubscribe
  on public.email_alert_subscriptions (unsubscribe_token_hash) where status in ('pending', 'active');
create index if not exists idx_email_alert_rate_limit
  on public.email_alert_subscriptions (request_fingerprint, requested_at desc);

create table if not exists public.email_alert_request_events (
  id                   bigint generated always as identity primary key,
  request_fingerprint  text not null,
  created_at           timestamptz not null default now()
);
create index if not exists idx_email_alert_request_events_window
  on public.email_alert_request_events (request_fingerprint, created_at desc);

create table if not exists public.email_alert_outbox (
  id                 uuid primary key default gen_random_uuid(),
  subscription_id    uuid not null references public.email_alert_subscriptions (id) on delete cascade,
  message_kind       text not null check (message_kind in ('confirmation', 'alert')),
  dedupe_key         text not null,
  recipient_email    text not null,
  payload            jsonb not null,
  status             text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'cancelled')),
  attempts           integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at    timestamptz not null default now(),
  claimed_at         timestamptz,
  sent_at            timestamptz,
  last_error         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (subscription_id, message_kind, dedupe_key)
);

create index if not exists idx_email_alert_outbox_pending
  on public.email_alert_outbox (status, next_attempt_at, created_at);

create trigger trg_email_alert_subscriptions_updated_at
  before update on public.email_alert_subscriptions
  for each row execute function set_updated_at();
create trigger trg_email_alert_outbox_updated_at
  before update on public.email_alert_outbox
  for each row execute function set_updated_at();

alter table public.email_alert_subscriptions enable row level security;
alter table public.email_alert_outbox enable row level security;
alter table public.email_alert_request_events enable row level security;
-- No public policies. Public actions use bounded server routes; delivery and
-- administration use service role only.

create or replace function public.claim_email_alert_outbox(p_limit integer default 25)
returns setof public.email_alert_outbox
language plpgsql security definer set search_path = '' as $$
begin
  -- Recover leases after a worker crash. A fifth claimed attempt is terminal;
  -- earlier attempts return to the retry queue.
  update public.email_alert_outbox
    set status = 'cancelled',
        last_error = coalesce(last_error, 'Delivery lease expired after final attempt')
    where status = 'sending'
      and claimed_at < now() - interval '15 minutes'
      and attempts >= 5;
  update public.email_alert_outbox
    set status = 'pending',
        next_attempt_at = now(),
        last_error = coalesce(last_error, 'Delivery lease expired; retrying')
    where status = 'sending'
      and claimed_at < now() - interval '15 minutes'
      and attempts < 5;

  return query
  with claimable as (
    select id from public.email_alert_outbox
    where status = 'pending' and attempts < 5 and next_attempt_at <= now()
    order by created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 50)
  )
  update public.email_alert_outbox o
    set status = 'sending', claimed_at = now(), attempts = attempts + 1
  from claimable c where o.id = c.id
  returning o.*;
end;
$$;

revoke all on function public.claim_email_alert_outbox(integer) from public, anon, authenticated;
grant execute on function public.claim_email_alert_outbox(integer) to service_role;

create or replace function public.consume_email_alert_request_limit(p_fingerprint text, p_max integer default 5)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_fingerprint, 0));
  select count(*) into v_count from public.email_alert_request_events
    where request_fingerprint = p_fingerprint
      and created_at >= now() - interval '24 hours';
  if v_count >= least(greatest(p_max, 1), 20) then return false; end if;
  insert into public.email_alert_request_events (request_fingerprint) values (p_fingerprint);
  delete from public.email_alert_request_events where created_at < now() - interval '7 days';
  return true;
end;
$$;

revoke all on function public.consume_email_alert_request_limit(text, integer) from public, anon, authenticated;
grant execute on function public.consume_email_alert_request_limit(text, integer) to service_role;

-- One transaction owns deduplication, refresh and confirmation enqueueing.
-- The advisory lock closes the select/insert race for identical criteria.
create or replace function public.request_email_alert_subscription(
  p_subscription_id uuid,
  p_email text,
  p_criteria_kind text,
  p_criteria_key text,
  p_confirmation_token_hash text,
  p_unsubscribe_token_hash text,
  p_request_fingerprint text,
  p_confirmation_url text,
  p_unsubscribe_url text
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_subscription public.email_alert_subscriptions%rowtype;
begin
  if not public.consume_email_alert_request_limit(p_request_fingerprint, 5) then
    return 'rate-limited';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'email-alert|' || p_email || '|' || p_criteria_kind || '|' || coalesce(p_criteria_key, ''),
      0
    )
  );

  select * into v_subscription
    from public.email_alert_subscriptions
    where email = p_email
      and criteria_kind = p_criteria_kind
      and criteria_key is not distinct from p_criteria_key
      and status in ('pending', 'active')
    limit 1;

  if found and v_subscription.status = 'active' then
    return 'already-active';
  end if;

  if found then
    update public.email_alert_subscriptions
      set confirmation_token_hash = p_confirmation_token_hash,
          unsubscribe_token_hash = p_unsubscribe_token_hash,
          request_fingerprint = p_request_fingerprint,
          requested_at = now()
      where id = v_subscription.id;
    update public.email_alert_outbox
      set status = 'cancelled'
      where subscription_id = v_subscription.id
        and message_kind = 'confirmation'
        and status in ('pending', 'sending');
  else
    insert into public.email_alert_subscriptions (
      id, email, criteria_kind, criteria_key, confirmation_token_hash,
      unsubscribe_token_hash, request_fingerprint
    ) values (
      p_subscription_id, p_email, p_criteria_kind, p_criteria_key,
      p_confirmation_token_hash, p_unsubscribe_token_hash,
      p_request_fingerprint
    ) returning * into v_subscription;
  end if;

  insert into public.email_alert_outbox (
    subscription_id, message_kind, dedupe_key, recipient_email, payload
  ) values (
    v_subscription.id,
    'confirmation',
    'confirmation:' || left(p_confirmation_token_hash, 16),
    p_email,
    jsonb_build_object(
      'criteria', jsonb_build_object('kind', p_criteria_kind, 'key', p_criteria_key),
      'confirmationUrl', p_confirmation_url,
      'unsubscribeUrl', p_unsubscribe_url
    )
  );
  return 'queued';
end;
$$;

revoke all on function public.request_email_alert_subscription(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.request_email_alert_subscription(uuid, text, text, text, text, text, text, text, text) to service_role;

-- Privacy retention: abuse events for seven days; terminal delivery and
-- unsubscribed/bounced records for thirty days. Active consent remains until
-- the user unsubscribes.
create or replace function public.prune_email_alert_data()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from public.email_alert_request_events
    where created_at < now() - interval '7 days';
  delete from public.email_alert_outbox
    where status in ('sent', 'cancelled')
      and updated_at < now() - interval '30 days';
  delete from public.email_alert_subscriptions
    where status in ('unsubscribed', 'bounced')
      and updated_at < now() - interval '30 days';
end;
$$;

revoke all on function public.prune_email_alert_data() from public, anon, authenticated;
grant execute on function public.prune_email_alert_data() to service_role;
