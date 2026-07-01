# Bank / Credit Card Offer Workflow

> **Design document only.** This proposes an additive migration for review —
> **no migration file has been created and nothing has been applied to any
> database.** Per `CLAUDE.md` ("Migrations must be reviewed before applying to
> production") and this expansion's stop conditions ("a migration is required
> and might affect production data → stop and ask"), the SQL below is a
> starting point for that conversation, not a fait accompli.

## Why a new table

Phase 1 (`docs/source-expansion-strategy.md`) already ruled out reusing an
existing table:

- **`points_offers`** is shaped for an ongoing per-dollar shopping earn rate
  (`merchant_id`, `earn_multiple`, `mechanism` ∈ `in-store-boost | card-linked
  | shopping-portal | base-earn`). A credit card sign-up bonus is a **one-off**,
  card-product-tied reward gated by a **spend threshold within a time window**,
  with an **annual fee** — none of which fit those columns without distorting
  the numeric fields the stack engine (`lib/stack/buildStack.ts`) relies on.
- **`cashback_offers`** is scoped by a DB `CHECK` constraint to exactly the two
  permitted cashback portals (`ShopBack`, `TopCashback`) — a bank statement
  credit is a different shape (card-linked, often merchant-specific, usually a
  flat $ amount rather than an ongoing rate) and loosening that constraint
  would blur two genuinely different concepts.
- **`weekly_deals`** was investigated and rejected in Phase 1: its
  `component_ids` field is written by the admin form but never dereferenced by
  any renderer — not a usable bundle mechanism today.

So this document proposes one new, single-purpose table — **`card_offers`** —
following the exact same pattern already used for `cashback_offers`,
`gift_card_offers` and `points_offers`: one table, one service-role admin
repo, one typed public card, an `is_published` gate.

## Proposed schema (additive, for review — not applied)

```sql
-- PROPOSED — not a migration file, not applied. For review only.
create table card_offers (
  id text primary key,
  bank text not null,                  -- e.g. "American Express", "NAB", "CBA"
  card_name text not null,             -- e.g. "Qantas Business Rewards Card"
  bonus_type text not null
    check (bonus_type in ('points', 'cashback', 'gift_card', 'statement_credit')),
  bonus_value_display text not null,   -- human display, e.g. "190,000 Qantas Points"
  bonus_points_program text,           -- nullable, e.g. "Qantas Frequent Flyer"
  minimum_spend_dollars numeric,       -- nullable
  spend_window_days integer,           -- nullable, e.g. 90
  annual_fee_dollars numeric,          -- nullable
  eligibility_notes text not null default '',
  expiry_date date,                    -- offer end date, nullable
  source_url text not null default '',
  citations jsonb not null default '[]',
  confidence text not null default 'needs-verification'
    check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  last_checked_at timestamptz not null default now(),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table card_offers enable row level security;

-- Public/anon can only ever see published rows — same pattern as every other
-- offer table (see supabase/migrations/001_initial_schema.sql).
create policy "public read published card_offers"
  on card_offers for select
  using (is_published = true);

-- No anon/authenticated insert/update/delete policy — writes are service-role
-- only, via the admin repo (same as cashback_offers/gift_card_offers/points_offers).
```

Notes on the design:

- `bonus_type` covers all of #1/#2/#9 from the source expansion strategy
  (credit card sign-up bonuses, bank statement credits/cashback, bank-linked
  gift-card promos) in one table, since they share the same shape (a bank/card
  product, a bonus, an eligibility window).
- `is_published` defaults to **`false`** (stricter than the other offer
  tables' default of `true`) — new bank/card content should require an
  explicit admin publish action, not accidentally go live on insert.
- No FK to `stores` — a card offer isn't merchant-specific the way a cashback
  rate is; `bank`/`card_name` are free text, matching how `provider` works on
  `cashback_offers`.

## Admin workflow (manual entry only)

Mirrors the existing `cashback` / `gift-cards` / `points` admin pattern
exactly:

1. `lib/admin/repos/cardOffers.ts` (service-role only) —
   `listCardOffers`, `getCardOffer`, `insertCardOffer`, `updateCardOffer`,
   `setCardOfferPublished`.
2. `app/admin/(protected)/card-offers/page.tsx` (list + publish toggle),
   `new/page.tsx`, `[id]/edit/page.tsx`, `actions.ts` — every write behind
   `requireAdmin()` + `checkAdminRateLimit()`, logged via `logAudit()`
   (`lib/admin/repos/audit.ts`), `revalidatePath()` on save.
3. `components/admin/CardOfferForm.tsx` — plain form, no external calls. Copy
   states plainly: **"Manual entry — no scraping, no external source
   requests"** (matching the existing gift-card new-page copy).
4. Source: the admin reads the bank/issuer's **own public, non-login-gated**
   marketing or press page by hand, or cross-references a community post
   already staged in `feed_items` via the OzBargain pipeline (the AmEx Qantas
   and Westpac/StG/BoM/BSA items used to motivate this whole expansion are
   already sitting there today). Either way, a human types the structured
   row — **nothing is fetched automatically.**

## What stays out of scope for this phase

- **No fetcher, no cron, no monitor pass** for bank/card sites. Every AU bank
  and card-issuer offer page is login-gated and/or Cloudflare-protected —
  automating discovery there would violate the no-scraping/no-bypass rules
  outright. This table is **manual-entry-only**, full stop.
- **No automatic rate-change detection.** `offer_change_candidates` (staging
  table for admin-reviewed changes to existing offers) could, in principle, be
  extended later with `source_type = 'card_offer'` and a
  `card_offers` entry in `OFFER_TARGET` (`lib/monitor/offerChanges.ts`) — but
  that requires its own migration (a new `check` constraint value) and code
  change, and there is still no live detector for anything in that table
  today (confirmed in Phase 1 research: `insertOfferChangeCandidates()` is
  currently called nowhere in the app). Out of scope here; flagged as a
  possible future phase, not built.
- **No public UI** is built in this phase — see Phase 9
  (`docs/public-ui-expansion-plan.md`) for where this would surface.

## Next step

This design needs your explicit go-ahead before anything is created:

1. Confirm the `card_offers` shape above (or request changes).
2. If approved, the next phase would be: create the actual migration file
   under `supabase/migrations/`, generate the admin repo + CRUD pages +
   form following the pattern above, and add tests — as its own
   reviewable, separately-committed change. **Not done as part of this
   planning phase.**
