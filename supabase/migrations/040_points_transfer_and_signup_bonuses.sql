-- 040_points_transfer_and_signup_bonuses.sql
--
-- Two gaps in the points model, both surfaced by real offers we could not
-- represent:
--
--   1. TRANSFER BONUSES — a promotion on moving points between two programmes
--      (e.g. "bonus 5–15% transferring Flybuys → Velocity, ends 28 Jul"). This
--      is a relationship between two programmes, not an earn rate at a
--      merchant, so points_offers cannot hold it. New table.
--
--   2. SIGN-UP / ACQUISITION BONUSES — a one-off points award for taking out a
--      policy, switching a utility, linking an app (e.g. "20,000 Flybuys for
--      HCF health insurance"). These DO fit points_offers: merchant_id is
--      already nullable and earn_rate_display is free text. They only failed
--      the `mechanism` check constraint. One new allowed value, no new table.
--
-- Both follow the existing offer contract exactly: default-unpublished,
-- citations required, Sydney-inclusive expiry in RLS, and archival in
-- run_daily_cleanup — so the four-layer expiry model in
-- docs/offer-expiry-semantics.md covers them without special-casing.

-- ── 1. Sign-up bonuses reuse points_offers ──────────────────────────────────

alter table public.points_offers drop constraint if exists points_offers_mechanism_check;
alter table public.points_offers add constraint points_offers_mechanism_check
  check (mechanism in ('in-store-boost', 'card-linked', 'shopping-portal', 'base-earn', 'signup-bonus'));

-- ── 2. Transfer bonuses ─────────────────────────────────────────────────────

create table if not exists public.points_transfer_bonuses (
  id                  text primary key,
  -- Programme slugs from lib/rewards/programmes.ts (e.g. 'flybuys',
  -- 'velocity-frequent-flyer'). Deliberately NOT a foreign key: the programme
  -- list is editorial content in the app, not a table.
  from_programme      text not null,
  to_programme        text not null,
  -- A bonus is usually advertised as a range ("5–15%") because the rate depends
  -- on tier or amount. A flat bonus sets both to the same value.
  bonus_percent_min   numeric not null check (bonus_percent_min >= 0),
  bonus_percent_max   numeric not null check (bonus_percent_max >= 0),
  starts_on           date,
  expiry_date         date,
  -- Our own short description of the conditions, never copied source prose.
  conditions_note     text,
  citations           jsonb not null default '[]'::jsonb,
  confidence          text not null default 'needs-verification'
                        check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at     timestamptz not null default now(),
  is_published        boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint points_transfer_bonuses_range_check
    check (bonus_percent_max >= bonus_percent_min),
  -- A transfer to the programme you are already in is not a transfer.
  constraint points_transfer_bonuses_distinct_check
    check (from_programme <> to_programme)
);

create index if not exists idx_points_transfer_bonuses_to
  on public.points_transfer_bonuses (to_programme, is_published);

create trigger trg_points_transfer_bonuses_updated_at
  before update on public.points_transfer_bonuses
  for each row execute function set_updated_at();

-- Default-deny. One published-only SELECT policy carrying the same
-- Sydney-inclusive expiry bound every other public offer table uses (036/037):
-- a bonus is live through the WHOLE of its expiry day.
alter table public.points_transfer_bonuses enable row level security;

create policy "public read current points_transfer_bonuses"
  on public.points_transfer_bonuses for select to anon, authenticated
  using (
    is_published = true
    and (
      expiry_date is null
      or expiry_date >= ((statement_timestamp() at time zone 'Australia/Sydney'))::date
    )
  );

-- ── 3. Archive expired transfer bonuses with everything else ────────────────
-- Re-issues run_daily_cleanup (last set by 039) with one more loop, so durable
-- state keeps matching the read boundary. Signature unchanged.

create or replace function public.run_daily_cleanup(
  p_today date,
  p_archived_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  expired_offers integer := 0;
  cards integer := 0;
  transfers integer := 0;
  reason text := 'expiry-before-' || p_today::text;
begin
  for changed in
    update public.gift_card_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'gift_card_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.cashback_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'cashback_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.points_offers set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'points_offers', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.weekly_deals set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    expired_offers := expired_offers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'weekly_deals', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.points_transfer_bonuses set is_published = false
    where is_published = true and expiry_date < p_today returning id
  loop
    transfers := transfers + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-expired', 'points_transfer_bonuses', changed.id, jsonb_build_object('reason', reason));
  end loop;

  for changed in
    update public.card_offers
    set is_published = false, is_archived = true, archived_at = p_archived_at
    where is_archived = false
      and (expiry_date < p_today or review_by_date < p_today)
    returning id,
      case when expiry_date < p_today then 'expired' else 'review-overdue' end as archive_reason
  loop
    cards := cards + 1;
    insert into public.audit_log(actor_email, action, table_name, row_id, diff)
    values ('system@dealstack.local', 'auto-archive-card', 'card_offers', changed.id, jsonb_build_object('reason', changed.archive_reason));
  end loop;

  return jsonb_build_object(
    'expiredOffers', expired_offers,
    'cardOffers', cards,
    'transferBonuses', transfers
  );
end;
$$;

revoke all on function public.run_daily_cleanup(date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_daily_cleanup(date, timestamptz)
  to service_role;
