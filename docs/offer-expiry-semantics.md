# Offer expiry — semantics and defence in depth

Authoritative description of how DealStack AU expires every time-limited offer.
The rule and its enforcement layers are summarised here so a reviewer never has
to reconstruct them from the code.

## The rule (one sentence)

An offer is live through the **entire** `expiry_date` in **Australia/Sydney**
time and disappears from every public surface at **00:00 the following Sydney
calendar day**. It is never expired at the *start* of its expiry date.

Formally, with `today = ` the Australia/Sydney calendar date:

- `expiry_date >= today` → **live** (inclusive on the expiry day).
- `expiry_date < today` → **expired** (strictly after the expiry day).
- `expiry_date IS NULL` → **evergreen**, never expired by date. A gift-card row
  is only treated as genuinely current when a reviewer also marked it
  `is_ongoing` (a bare null expiry ranks last and is labelled "date unknown").
- `is_ongoing = true` (with null expiry) → never archived.

Dates are compared as `YYYY-MM-DD` **strings** / SQL `date`s, never via
`Date` parsing (which is UTC-relative and off by one around AU midnight). The
Sydney date is derived with `Australia/Sydney`, so it is DST-correct in both
AEST (UTC+10) and AEDT (UTC+11) — there is no fixed `+10:00` offset anywhere.

Intra-day `expiry_time` / `expiry_timezone` are **display-only**. Archival is
deliberately date-level: an offer whose fine print says "ends 5pm" is still
shown all day and removed the next Sydney day, so a still-valid offer is never
removed early.

The single source of truth for the classifier is
[`lib/offers/expiry.ts`](../lib/offers/expiry.ts) (`todayAU`, `isPastExpiry`,
`filterLive`) and [`lib/giftcards/dateState.ts`](../lib/giftcards/dateState.ts)
(`giftCardDateState` → `future | active | expired | ongoing | missing`). The
four states are mutually exclusive by construction.

## Defence in depth — four independent layers

Correctness never depends on a single mechanism.

### 1. Read-time boundary (primary, immediate)

Every public repository applies the Sydney boundary at read time, so an expired
offer is hidden **the instant** the Sydney day rolls over, regardless of whether
any job has run:

| Surface | Entry point | Boundary |
| --- | --- | --- |
| Homepage carousel | `getCurrentReviewedGiftCardOffers` → `buildMarquee` | `orderCurrentReviewedGiftCardOffers` |
| `/gift-cards` grid | `getCurrentReviewedGiftCardOffers` | same |
| `/gift-cards/[id]` detail | `findOffer` → `.find` on the same list | expired/far-future → `notFound()` |
| Stack engine + `/deals` + search | `getGiftCardOffers` (strict), `loadStackData` | `filterConfirmedCurrentOffers` + `filterLive` |
| Cashback / points | `getCashbackOffers`, `getPointsOffers` | `filterLive` |
| Card offers | `getCardOffers` | `filterLive` |
| Weekly deals + sitemap | `getWeeklyDeals` | `filterLive` |
| Public counts | derived from the already-filtered pools | — |

The sitemap lists no individual offer detail routes, so it can never advertise
an expired permalink.

### 2. Scheduled archival (durable state)

[`run_daily_cleanup`](../supabase/migrations/039_remove_ozbargain.sql)
runs every day via the `daily-cleanup` Vercel cron (`0 0 * * *` UTC =
10:00 AEST / 11:00 AEDT Sydney — the same slot the OzBargain monitor cron used
to carry it from). It flips the
publication flag on every published row whose `expiry_date < today` (Sydney) —
gift-card, cashback, points, weekly-deal and card offers. It:

- makes **no outbound requests** — it talks only to our own Supabase project;
- is **idempotent** — the `where is_published = true and expiry_date < today`
  filter excludes already-archived rows, so a second run finds nothing;
- **never deletes** — it only sets `is_published = false` (and archives card
  offers);
- writes an **`audit_log`** row for every change (`auto-archive-expired`,
  `auto-archive-card`), preserving lineage and history.

Gift-card offers additionally have the richer
[`apply_gift_card_offer_lifecycle`](../supabase/migrations/032_gift_card_lifecycle_orchestration.sql)
RPC (7am Sydney, env-gated) that activates approved-future rows on their start
date, seals a history occurrence on archival, and audits both transitions.

### 3. Database / RLS enforcement (belt and suspenders)

Public `SELECT` policies bound visibility by the Sydney expiry date, so even a
future code path that forgot the read-time filter cannot serve an expired row:

- **`card_offers`** — migration 009 (live), with its bound (and its history
  mirror) aligned from `Australia/Melbourne` to `Australia/Sydney` by migration
  037 (applied 2026-07-22); Melbourne and Sydney share offset and DST rules, so
  this changed no row's visibility.
- **`gift_card_offers`** — migration 033 (applied): a confirmed row is visible
  only if it is currently active **or** a lineage-carrying `approved-future`
  ("upcoming") row, in both cases bounded by `expiry_date >= sydney_today`.
- **`cashback_offers` / `points_offers` / `weekly_deals`** — migration 036
  (applied 2026-07-22) adds the same Sydney-inclusive bound.
  This layer is belt-and-suspenders: layers 1 and 2 already guarantee the
  behaviour, so it only removes the theoretical sub-day window before the daily
  cleanup runs. Every public offer table now enforces the Sydney expiry date in
  RLS (`verify:schema`: 37/37).

### 4. Monitoring + audit evidence

- [`/api/health/data`](../app/api/health/data/route.ts) now reports, per type, a
  count of **published/approved rows past their Sydney expiry day**
  (`expiredStillPublished`). In steady state this is always zero; a positive
  count means the archival job has silently stopped — the direct detector for a
  failed expiry job that the read filter would otherwise mask. Any positive
  count makes the endpoint alert.
- Every archival writes an `audit_log` row; nothing is ever hard-deleted, so
  source lineage, review history and occurrence snapshots are preserved.

## State consistency

`upcoming` (start in the future), `active` (started, not past expiry),
`expiring-today` (a live sub-state of active — `expiry_date = today`) and
`expired` are derived from the one `giftCardDateState` classifier, so they are
mutually consistent across every surface and job. The stack **engine** excludes
`upcoming` rows entirely (`filterConfirmedCurrentOffers`), while the display
surfaces show them with an explicit "Starts D Mon YYYY" label and never any
active-sounding urgency.

## Tests

- [`tests/deals/offerExpiryLifecycle.test.ts`](../tests/deals/offerExpiryLifecycle.test.ts)
  — 14 controlled-clock scenarios (day-before, start-of-day, final second,
  midnight-after, AEDT/AEST transitions, unknown expiry, ongoing,
  already-archived, repeated + concurrent runs, public filtering with no cron
  run, cross-surface consistency, mutual state consistency).
- [`tests/admin/dataHealthExpiry.test.ts`](../tests/admin/dataHealthExpiry.test.ts)
  — the health verdict (any expired-but-published row → alert).
- Migration contracts for 019/039 (all-type Sydney archival + audit, no
  deletes), 033 (upcoming arm), 036 and 037 in
  [`tests/admin/migrationContracts.test.ts`](../tests/admin/migrationContracts.test.ts).
- Existing suites: `tests/stack/expiryGuard.test.ts`,
  `tests/giftcards/lifecycle.test.ts`, `tests/giftcards/lifecycleRoute.test.ts`
  (cron auth 401 + failure handling), `tests/admin/cleanup.test.ts`.
