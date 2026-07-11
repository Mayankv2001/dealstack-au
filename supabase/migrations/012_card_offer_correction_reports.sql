-- DealStack AU — private, rate-limited card-offer correction reports

create table if not exists public.card_offer_correction_reports (
  id uuid primary key default gen_random_uuid(),
  card_offer_id text references public.card_offers(id) on delete set null,
  reported_offer_label text not null,
  reason text not null check (reason in ('terms', 'fee', 'bonus', 'expiry', 'eligibility', 'other')),
  details text not null check (char_length(details) between 10 and 2000),
  status text not null default 'new' check (status in ('new', 'reviewed', 'dismissed')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.correction_report_rate_limits (
  id bigserial primary key,
  request_fingerprint text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_card_offer_correction_reports_status_created
  on public.card_offer_correction_reports (status, created_at desc);
create index if not exists idx_correction_report_rate_limits_lookup
  on public.correction_report_rate_limits (request_fingerprint, created_at desc);

create trigger trg_card_offer_correction_reports_updated_at
  before update on public.card_offer_correction_reports
  for each row execute function public.set_updated_at();

alter table public.card_offer_correction_reports enable row level security;
alter table public.correction_report_rate_limits enable row level security;

create or replace function public.submit_card_offer_correction(
  p_card_offer_id text,
  p_reason text,
  p_details text,
  p_request_fingerprint text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_label text;
  recent_count integer;
begin
  if p_reason not in ('terms', 'fee', 'bonus', 'expiry', 'eligibility', 'other')
    or char_length(trim(p_details)) not between 10 and 2000
    or char_length(p_request_fingerprint) < 32
  then
    raise exception 'invalid correction report';
  end if;

  select provider || ' ' || card_name
  into offer_label
  from public.card_offers
  where id = p_card_offer_id
    and is_published = true
    and is_archived = false
    and confidence = 'confirmed'
    and review_by_date >= (now() at time zone 'Australia/Melbourne')::date
    and (expiry_date is null or expiry_date >= (now() at time zone 'Australia/Melbourne')::date);

  if offer_label is null then
    raise exception 'offer is not publicly reportable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_request_fingerprint, 0)
  );
  select count(*)::integer into recent_count
  from public.correction_report_rate_limits
  where request_fingerprint = p_request_fingerprint
    and created_at >= pg_catalog.clock_timestamp() - interval '1 hour';
  if recent_count >= 5 then return false; end if;

  insert into public.correction_report_rate_limits (request_fingerprint)
  values (p_request_fingerprint);
  insert into public.card_offer_correction_reports (
    card_offer_id, reported_offer_label, reason, details
  ) values (
    p_card_offer_id, offer_label, p_reason, trim(p_details)
  );

  delete from public.correction_report_rate_limits
  where created_at < pg_catalog.clock_timestamp() - interval '1 day';
  return true;
end;
$$;

revoke all on function public.submit_card_offer_correction(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_card_offer_correction(text, text, text, text)
  to service_role;

-- Admin status updates are transactionally audited by migration 011's trigger.
create trigger trg_transactional_admin_audit
  after insert or update or delete on public.card_offer_correction_reports
  for each row execute function public.audit_admin_mutation();

