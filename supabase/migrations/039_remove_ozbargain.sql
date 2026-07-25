-- 039_remove_ozbargain.sql
--
-- Removes the OzBargain ingestion subsystem from the database.
--
-- REVIEW BEFORE APPLYING — this migration DROPS TABLES AND DATA. At the time it
-- was written production held 215 approved signals, 824 feed items, 5 feed
-- sources, 57 fetch-log rows, 2 compliance reviews, 14 pipeline runs and 8
-- recheck runs. Take a backup (or confirm PITR covers the window) before
-- running it; there is no down-migration.
--
-- Ordering matters:
--   1. run_daily_cleanup is REPLACED first, offers-only, so the surviving
--      expiry hygiene for gift-card/cashback/points/weekly/card offers keeps
--      working. Its signature changes (the two staleness bounds only ever fed
--      the signal/feed branches), so the old 4-arg version is dropped after the
--      new one is created.
--   2. The feed/signal-only functions are dropped.
--   3. The tables are dropped last, children before parents.
--
-- Nothing here touches stores, gift_card_*, cashback_offers, points_offers,
-- card_offers, weekly_deals, admins, audit_log or the admin rate limiters.
-- Existing audit_log rows that reference the dropped tables are deliberately
-- KEPT: audit_log.table_name is free text with no FK, so the history of what
-- was done to the signals remains readable after the tables are gone.

-- ── 1. Offers-only daily cleanup ────────────────────────────────────────────

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
    'cardOffers', cards
  );
end;
$$;

revoke all on function public.run_daily_cleanup(date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.run_daily_cleanup(date, timestamptz)
  to service_role;

-- ── 2. Drop the feed/signal-only routines ───────────────────────────────────
-- run_daily_pipeline_cleanup wrapped the old signature and the feed purge; both
-- go. The 4-arg run_daily_cleanup is dropped only now that its replacement and
-- its last caller are gone.

drop function if exists public.run_daily_pipeline_cleanup(date, timestamptz, timestamptz, timestamptz, timestamptz);
drop function if exists public.run_daily_cleanup(date, timestamptz, timestamptz, timestamptz);
drop function if exists public.purge_reviewed_feed_items(timestamptz);
drop function if exists public.approve_feed_item(uuid, text, text, text, text, text, text, date, numeric);
drop function if exists public.archive_recheck_feed_item(uuid, text, text, text, uuid, timestamptz, text);
drop function if exists public.archive_invalid_signal(text, text, timestamptz);
drop function if exists public.archive_expired_deals(date, timestamptz);

-- ── 3. Drop the tables ──────────────────────────────────────────────────────
-- cascade clears the RLS policies, indexes, triggers and FKs that hang off
-- them. Children first so the cascade has nothing left to chase.

drop table if exists public.feed_fetch_log cascade;
drop table if exists public.feed_items cascade;
drop table if exists public.feed_sources cascade;
drop table if exists public.offer_change_candidates cascade;
drop table if exists public.compliance_reviews cascade;
drop table if exists public.ozb_recheck_runs cascade;
drop table if exists public.daily_pipeline_runs cascade;
drop table if exists public.ozbargain_signals cascade;

-- Dropped only now: its trigger lived on offer_change_candidates, so the
-- function still had a dependent until that table went.
drop function if exists public.audit_system_offer_change_insert();

-- ── 4. Retire the 'signal' weekly-deal highlight ────────────────────────────
-- No production row uses it (verified before writing this migration).

alter table public.weekly_deals drop constraint if exists weekly_deals_highlight_check;
alter table public.weekly_deals add constraint weekly_deals_highlight_check
  check (highlight in ('best-stack', 'gift-card', 'points', 'cashback', 'needs-verification'));
