-- DealStack AU - direct moderation queue and daily pipeline accounting
--
-- feed_items remains the private review ledger. Approval is one transaction:
-- lock the item, dedupe/create an approved signal, then mark the item imported.
-- Rejection archives the row as review_state='rejected'.

alter table public.feed_items
  add column if not exists thumbnail_url text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

alter table public.feed_items
  drop constraint if exists feed_items_review_state_check;
alter table public.feed_items
  add constraint feed_items_review_state_check
  check (review_state in ('new', 'imported', 'ignored', 'duplicate', 'rejected'));

alter table public.feed_fetch_log
  add column if not exists items_skipped integer not null default 0,
  add column if not exists items_updated integer not null default 0;

alter table public.ozbargain_signals
  add column if not exists archived_at timestamptz,
  add column if not exists archive_reason text,
  add column if not exists last_validated_at timestamptz;

create table if not exists public.daily_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running'
    check (status in ('running', 'ok', 'partial', 'error', 'disabled', 'blocked')),
  expired_archived integer not null default 0,
  invalid_archived integer not null default 0,
  validation_checked integer not null default 0,
  validation_unknown integer not null default 0,
  feeds_processed integer not null default 0,
  items_fetched integer not null default 0,
  items_new integer not null default 0,
  items_updated integer not null default 0,
  items_skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_pipeline_runs_started
  on public.daily_pipeline_runs (started_at desc);
create index if not exists idx_feed_items_content_hash
  on public.feed_items (content_hash)
  where content_hash is not null;
create index if not exists idx_feed_items_link
  on public.feed_items (link);
create index if not exists idx_signals_validation_due
  on public.ozbargain_signals (status, last_validated_at)
  where status = 'approved';

alter table public.daily_pipeline_runs enable row level security;

-- Remove the pre-content-lock draft signature if this migration was evaluated
-- during development, so only the race-safe RPC remains callable.
drop function if exists public.approve_feed_item(uuid, text, text, text, text, text, date, numeric);

create or replace function public.approve_feed_item(
  p_feed_item_id uuid,
  p_expected_content_hash text,
  p_signal_id text,
  p_merchant_id text,
  p_deal_kind text,
  p_price_text text,
  p_promo_code text,
  p_expiry_date date,
  p_signal_score numeric
)
returns table(signal_id text, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  item public.feed_items%rowtype;
  existing_id text;
  actor text;
begin
  select * into item
  from public.feed_items
  where id = p_feed_item_id
  for update;

  if not found then raise exception 'Feed item not found.'; end if;
  if item.review_state = 'imported' and item.promoted_signal_id is not null then
    return query select item.promoted_signal_id, false;
    return;
  end if;
  if item.review_state <> 'new' then
    raise exception 'Feed item is no longer awaiting review.';
  end if;
  if item.content_hash is distinct from p_expected_content_hash then
    raise exception 'Feed item changed during review. Refresh and review it again.';
  end if;

  begin
    actor := lower(trim(
      nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb
        ->> 'x-dealstack-admin-actor'
    ));
  exception when others then
    actor := null;
  end;

  select id into existing_id
  from public.ozbargain_signals
  where source_native_id = item.source_native_id
  for update;

  if existing_id is null then
    insert into public.ozbargain_signals (
      id, source_native_id, merchant_id, title, summary, votes_sample,
      comment_count, sentiment, deal_kind, source_url, merchant_url,
      product_url, posted_at, expiry_date, tags, promo_code, price_text,
      signal_score, confidence, last_checked_at, is_sample, status,
      archived_at, archive_reason, last_validated_at
    ) values (
      p_signal_id, item.source_native_id, p_merchant_id, item.raw_title,
      left(coalesce(nullif(trim(item.raw_summary), ''), item.raw_title), 200),
      null, null, 'neutral', p_deal_kind, item.link, null, null,
      case when item.posted_at is null then null else item.posted_at::date end,
      p_expiry_date, item.categories, p_promo_code, p_price_text,
      p_signal_score, 'needs-verification', now(), false, 'approved',
      null, null, now()
    );
    existing_id := p_signal_id;
    created := true;
  else
    update public.ozbargain_signals
    set status = 'approved', archived_at = null, archive_reason = null,
        last_checked_at = now(), last_validated_at = now()
    where id = existing_id;
    created := false;
  end if;

  update public.feed_items
  set review_state = 'imported', promoted_signal_id = existing_id,
      reviewed_at = now(),
      reviewed_by = coalesce(nullif(actor, ''), 'unknown')
  where id = item.id;

  signal_id := existing_id;
  return next;
end;
$$;

revoke all on function public.approve_feed_item(uuid, text, text, text, text, text, text, date, numeric)
  from public, anon, authenticated;
grant execute on function public.approve_feed_item(uuid, text, text, text, text, text, text, date, numeric)
  to service_role;

create or replace function public.archive_expired_deals(
  p_today date,
  p_archived_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  total integer := 0;
  reason text := 'expiry-before-' || p_today::text;
begin
  for changed in
    update public.gift_card_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'gift_card_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;
  for changed in
    update public.cashback_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'cashback_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;
  for changed in
    update public.points_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'points_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;
  for changed in
    update public.weekly_deals set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'weekly_deals', changed.id, jsonb_build_object('reason', reason));
  end loop;
  for changed in
    update public.ozbargain_signals
    set status = 'expired', archived_at = p_archived_at,
        archive_reason = reason, last_validated_at = p_archived_at
    where status = 'approved' and expiry_date < p_today returning id
  loop
    total := total + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'ozbargain_signals', changed.id, jsonb_build_object('reason', reason));
  end loop;
  return total;
end;
$$;

create or replace function public.archive_invalid_signal(
  p_signal_id text,
  p_reason text,
  p_archived_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_id text;
begin
  update public.ozbargain_signals
  set status = 'expired', archived_at = p_archived_at,
      archive_reason = p_reason, last_validated_at = p_archived_at
  where id = p_signal_id and status = 'approved'
  returning id into changed_id;
  if changed_id is null then return false; end if;
  insert into public.audit_log(actor_email, action, table_name, row_id, diff)
  values ('system@dealstack.local', 'auto-archive-invalid', 'ozbargain_signals', changed_id, jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

revoke all on function public.archive_expired_deals(date, timestamptz)
  from public, anon, authenticated;
revoke all on function public.archive_invalid_signal(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.archive_expired_deals(date, timestamptz)
  to service_role;
grant execute on function public.archive_invalid_signal(text, text, timestamptz)
  to service_role;
