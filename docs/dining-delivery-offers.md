# Dining Delivery Offers (Uber Eats / DoorDash) — Support Plan

## Decision: existing `ozbargain_signals` is enough for now

Phase 1 research judged `weekly_deals` a poor fit for a one-off dining-delivery
promo (it is a curated weekly-bundle model, not a per-signal one). Note that
`weekly_deals` is no longer inert: as of commit `2835137` its `component_ids`
are resolved and rendered as the "This week's picks" section on `/deals` (see
`lib/offers/weeklyPicks.ts`). `ozbargain_signals`, by contrast, already fits a
one-off, publicly-posted dining-delivery promo code with **zero schema
change**:

| Need | Existing `ozbargain_signals` field |
|---|---|
| Headline | `title` |
| Details / code / min spend (free text) | `summary` (admin's own paraphrase) |
| Structured price/discount text | `price_text` |
| Promo code | `promo_code` |
| Offer end date | `expiry_date` |
| Source link | `source_url` |
| Confidence / verification flag | `confidence` (rendered via `ConfidenceBadge`) |
| Deal type | `deal_kind` |

Proof this already works today: **"$10 Ding Dong Deals - Uber Eats" is
already sitting in `feed_items` right now**, staged from the existing,
approved OzBargain RSS pipeline — no new source, no new table, no new fetcher
needed to get dining-delivery content into the review queue.

**A dedicated `dining_delivery_offers` table is optional, not required**, and
is deferred until there's enough real content volume to justify the extra
maintenance (see "If volume grows" below).

## What's already done (Phases 3–5 of this expansion)

- **Classifier** (`lib/monitor/feedItemPreference.ts`): "uber eats",
  "doordash", "menulog", "deliveroo" are now preferred-category signals — a
  staged dining-delivery item is no longer auto-ignored. Generic
  "dining"/"restaurant"/"takeaway" wording with no platform name or rewards
  signal still stays non-preferred (unchanged, deliberately conservative).
- **Homepage ranking** (`lib/repos/topDealsRanking.ts`): the same platform
  names now score as a positive signal for "Today's top OzBargain signals".
- **Admin queue presets** (`QueueClient.tsx`): "Uber Eats" and "DoorDash"
  quick-filter chips added, so an admin can jump straight to this category in
  `/admin/signals/queue`.

No further category/filter copy changes are needed this phase.

## Admin workflow (today, no new code)

1. A dining-delivery post is staged automatically by the existing OzBargain
   monitor (unchanged fetch/cron logic) and now correctly lands as
   `review_state = 'new'` in the queue rather than being auto-ignored.
2. Admin opens `/admin/signals/queue`, filters by the "Uber Eats"/"DoorDash"
   preset (or searches), reviews the raw title/summary.
3. Admin clicks **Import as pending signal** — reuses the existing signal
   create form, prefilled; the admin writes their own short paraphrase (never
   copies raw content), confirms/edits `deal_kind`, `price_text`,
   `promo_code`, `expiry_date`.
4. The new `ozbargain_signals` row is `status = 'pending'` — **not public**
   until a second, separate admin action (`setSignalStatus` → `approved`) on
   `/admin/signals`.

This is the **exact same** two-step staging→approval pipeline every other
OzBargain signal already goes through (`docs/ozbargain-monitoring.md`) —
nothing dining-delivery-specific was added to the review/publish gate.

## What the public card already shows

Reusing the existing `OzBargainSignal` → `SourceResultCard` rendering
(`lib/repos/sourceResults.ts`, `components/SourceResultCard.tsx` equivalent)
already covers every field the task asked for:

- **Platform** — implicit in `title`/`summary` (e.g. "Uber Eats", "DoorDash")
  and derivable from `sourceHostFromUrl(source_url)`.
- **Discount/code** — `price_text` / `promo_code`.
- **Minimum spend / new-vs-existing customer** — captured in the admin's
  `summary` paraphrase (free text; not a dedicated structured field today —
  see below).
- **Expiry** — `expiry_date`.
- **Source URL** — `source_url` (display-only, `nofollow`, never
  auto-opened).
- **Verification warning** — the existing `ConfidenceBadge` component already
  renders a "Needs verification" badge for anything not `confirmed`, and the
  homepage/deals pages already carry a platform-wide "Verify before you buy"
  message. No new UI needed.

## Explicit non-goals for this phase

- ❌ No scraping of the Uber Eats or DoorDash apps/websites — both require a
  logged-in account to see personalised offers, which is exactly the
  login-gated content this platform must never fetch.
- ❌ No new fetcher, cron, or API integration with either platform.
- ❌ No new table created in this phase.
- ❌ No auto-import or auto-approve — every dining-delivery signal goes
  through the same two-step manual review as everything else.

## If volume grows: optional `dining_delivery_offers` table

If dining-delivery content becomes frequent enough that admins want
structured comparison (platform dropdown, a real new-vs-existing-customer
boolean, filterable minimum spend) rather than free-text paraphrase, a small
additive table would look like:

```sql
-- PROPOSED (not created, not applied) — only build if/when volume justifies it.
create table dining_delivery_offers (
  id text primary key,
  platform text not null check (platform in ('uber-eats', 'doordash', 'menulog', 'deliveroo')),
  title text not null,
  discount_display text not null,       -- e.g. "25% off, up to $15"
  promo_code text,
  minimum_spend_dollars numeric,
  new_customer_only boolean,            -- null = unknown/unspecified
  expiry_date date,
  source_url text not null default '',
  confidence text not null default 'needs-verification'
    check (confidence in ('confirmed', 'needs-verification', 'expired-unknown')),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Same pattern as the `card_offers` proposal in
`docs/bank-card-offer-workflow.md`: additive, service-role-only writes,
`is_published` gate, manual entry from the same staged `feed_items` prompts —
**not built now**, and would need the same explicit go-ahead before a
migration file is created.
