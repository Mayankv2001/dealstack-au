# Bank / Credit Card Offer Workflow

> **Status: implemented.** This proposal was approved. The actual migration
> (`supabase/migrations/007_card_offers.sql`) has been created and applied to
> production, admin CRUD (`/admin/card-offers`) is live, 5 sample rows are
> seeded as unpublished drafts pending admin review, and the public read path
> (`/cards`) has shipped — see `docs/public-ui-expansion-plan.md` for that
> rollout. The schema below is the **original proposal** and differs from
> what was actually built (e.g. `provider`/`offer_type` instead of
> `bank`/`bonus_type`, a plain `source_url` instead of a `citations` jsonb
> column) — treat `supabase/migrations/007_card_offers.sql` as the source of
> truth for the current schema, not this document. The rest of this file is
> kept as a historical record of the design rationale.

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
- **No automatic publication or issuer-page fetching.** The RSS-only detection
  assistant can stage `card_offer` candidates behind `CARD_DETECT_ENABLED`.
  Resolved candidates may update only reviewed numeric fields after an admin
  clicks Apply; unresolved candidates prefill an unpublished draft. Issuer-page
  verification remains manual, and publish/archive state is never changed by
  detection or Apply.
- **No public UI** is built in this phase — see Phase 9
  (`docs/public-ui-expansion-plan.md`) for where this would surface.

## Addendum: source decision for card-offer discovery automation (2026-07-11)

The manual verification posture above is unchanged and remains the only way
`card_offers` rows get **published**. This addendum records the source decision
for the implemented detection assistant, which surfaces candidate new/changed
card offers in the admin review queue and never auto-publishes anything.

**Finder.com.au (credit card comparison) — rejected.** It publishes no
RSS/Atom feed or public API for card offers. Its `robots.txt` confirms this:
the only API-shaped path present (`/wp-json/finder/v1/geoip/...`) is unrelated
to card data and is itself disallowed. Building a fetcher there would mean
parsing Finder's HTML, which this project's architecture rule prohibits
outright ("RSS/Atom feed parsing only — no HTML scraping", `CLAUDE.md`)
regardless of what any `robots.txt` permits. No Finder fetcher is planned or
built. Recorded as a `compliance_reviews` row
(`approved_for_monitoring = false`) in migration
`017_card_source_registry.sql`, mirroring the rejection into the same table
that gates the OzBargain monitor.

**Compliant alternative: OzBargain's Credit Card tag feed.** A live RSS 2.0
feed at `https://www.ozbargain.com.au/tag/credit-card/feed` (channel title
"OzBargain - Credit Card") was verified on 2026-07-11 — `robots.txt` places no
`Disallow` on `/tag/` or `/feed` paths. This uses the exact same
already-approved OzBargain compliance review and feed-only posture the
existing monitor operates under (`source_type = 'ozbargain'`, already in
`APPROVED_FEED_SOURCE_TYPES` — see `lib/monitor/offerChanges.ts`); no new
fetching capability was added, only a new row in the existing allowlist.
Registered in `feed_sources` **disabled** (`kind = 'category'`) in the same
migration. Card-shaped heuristics now exist behind the independent,
default-off `CARD_DETECT_ENABLED` flag and only scan already-staged feed data.

Issuer pages remain the manual verification source of truth for actually
publishing a `card_offers` row, exactly as described above — a detected
OzBargain post is, at most, a lead an admin still checks against the bank's
own page before typing the row by hand.

## Next step (historical — superseded, see status note at top)

This design needed explicit go-ahead before anything was created:

1. Confirm the `card_offers` shape above (or request changes).
2. If approved, the next phase would be: create the actual migration file
   under `supabase/migrations/`, generate the admin repo + CRUD pages +
   form following the pattern above, and add tests — as its own
   reviewable, separately-committed change. **Not done as part of this
   planning phase.**
