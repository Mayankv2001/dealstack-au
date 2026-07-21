-- DealStack AU — Sydney-date expiry bound in public-read RLS (defence in depth)
--
-- FORWARD-ONLY / apply-gated (docs/runbooks/MIGRATION-SAFETY.md). This migration
-- ONLY replaces public SELECT policies; it approves, publishes, deletes and
-- backfills nothing.
--
-- Why: expired offers are already hidden from every public surface by two
-- independent layers — the read-time boundary (lib/offers/expiry.ts, Sydney
-- calendar date, applied in every repository) and the daily archival job
-- (run_daily_cleanup, migration 019, which flips is_published / status the day
-- after expiry). RLS is the third, DB-level layer: even a future code path that
-- forgot the read-time filter must not be able to serve an offer whose
-- Australia/Sydney expiry day has passed.
--
-- card_offers already carries this bound (migration 009). gift_card_offers gets
-- it from migration 033. This migration adds the SAME Sydney-inclusive rule to
-- the four remaining public offer tables. The rule is purely TIGHTENING — it can
-- only hide rows whose expiry_date is strictly before the current Sydney date;
-- it never exposes a row the old policy hid. A NULL expiry stays visible
-- (evergreen), matching the read-time boundary exactly. Service-role callers
-- (the cleanup and lifecycle jobs) bypass RLS and are unaffected.
--
-- Semantics: an offer is live THROUGH its whole Sydney expiry day and disappears
-- at 00:00 the following Sydney day. `expiry_date >= sydney_today` is inclusive
-- on the expiry day; `statement_timestamp() at time zone 'Australia/Sydney'`
-- yields that day DST-correctly (AEST and AEDT), never a fixed +10:00 offset.

-- ── cashback_offers ──────────────────────────────────────────────────────────
drop policy if exists "public read published cashback_offers"
  on public.cashback_offers;
drop policy if exists "public read current cashback_offers"
  on public.cashback_offers;
create policy "public read current cashback_offers"
  on public.cashback_offers for select to anon, authenticated
  using (
    is_published = true
    and (
      expiry_date is null
      or expiry_date >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
  );

-- ── points_offers ────────────────────────────────────────────────────────────
drop policy if exists "public read published points_offers"
  on public.points_offers;
drop policy if exists "public read current points_offers"
  on public.points_offers;
create policy "public read current points_offers"
  on public.points_offers for select to anon, authenticated
  using (
    is_published = true
    and (
      expiry_date is null
      or expiry_date >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
  );

-- ── weekly_deals ─────────────────────────────────────────────────────────────
drop policy if exists "public read published weekly_deals"
  on public.weekly_deals;
drop policy if exists "public read current weekly_deals"
  on public.weekly_deals;
create policy "public read current weekly_deals"
  on public.weekly_deals for select to anon, authenticated
  using (
    is_published = true
    and (
      expiry_date is null
      or expiry_date >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
  );

-- ── ozbargain_signals ────────────────────────────────────────────────────────
-- A moderated signal is public while status = 'approved'. The daily cleanup
-- flips an approved-but-expired signal to status = 'expired'; this bound closes
-- the sub-day window before that runs. A NULL expiry stays visible (the stale
-- sweep handles unvalidated evergreen signals separately).
drop policy if exists "public read approved ozbargain_signals"
  on public.ozbargain_signals;
drop policy if exists "public read current ozbargain_signals"
  on public.ozbargain_signals;
create policy "public read current ozbargain_signals"
  on public.ozbargain_signals for select to anon, authenticated
  using (
    status = 'approved'
    and (
      expiry_date is null
      or expiry_date >= (
        pg_catalog.statement_timestamp() at time zone 'Australia/Sydney'
      )::date
    )
  );
