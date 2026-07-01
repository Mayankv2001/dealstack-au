-- DealStack AU — card_offers (credit card / bank sign-up & cashback offers)
--
-- New, single-purpose table for manually-curated bank/card-issuer offers
-- (sign-up bonuses, cashback, statement credits, points bonuses, annual fee
-- discounts). See docs/bank-card-offer-workflow.md for the design rationale —
-- this does not fit points_offers (per-dollar ongoing earn rate) or
-- cashback_offers (CHECK-constrained to ShopBack/TopCashback portals only).
--
-- Manual-entry only: no fetcher, cron, or monitor pass writes here. An admin
-- reads a bank's own public, non-login-gated page (or a staged OzBargain
-- feed_items post) and types the row by hand via the admin repo.
--
-- Security posture: RLS enabled, default-deny. The only policy opens SELECT
-- to published rows for anon/authenticated — same pattern as gift_card_offers
-- and cashback_offers. All writes go through the service-role admin repo
-- (lib/admin/repos/cardOffers.ts), behind requireAdmin(). is_published
-- defaults to false — new rows require an explicit admin publish action.

create table if not exists public.card_offers (
  id                             text primary key,
  provider                      text not null,
  card_name                      text not null,
  offer_type                     text not null
                                   check (offer_type in (
                                     'sign_up_bonus',
                                     'cashback',
                                     'statement_credit',
                                     'points_bonus',
                                     'annual_fee_discount'
                                   )),
  bonus_points                   numeric,
  cashback_amount                numeric,
  statement_credit_amount        numeric,
  minimum_spend                  numeric,
  minimum_spend_period           text,
  annual_fee                     numeric,
  eligibility_notes              text not null default '',
  offer_summary                  text not null default '',
  source_url                     text not null default '',
  confidence                     text not null default 'needs-verification'
                                   check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  expiry_date                    date,
  last_checked_at                timestamptz not null default now(),
  is_published                   boolean not null default false,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);

create index if not exists idx_card_offers_published on public.card_offers (is_published);
create index if not exists idx_card_offers_provider on public.card_offers (provider);

create trigger trg_card_offers_updated_at before update on public.card_offers
  for each row execute function set_updated_at();

-- Default-deny: enable RLS, only a published-only SELECT policy for anon/
-- authenticated. No insert/update/delete policy — service role only.
alter table public.card_offers enable row level security;

create policy "public read published card_offers"
  on public.card_offers for select to anon, authenticated
  using (is_published = true);
