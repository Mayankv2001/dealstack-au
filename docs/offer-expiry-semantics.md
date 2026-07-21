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
| Top-deals / signals | `getTopDeals`, `getOzBargainSignals` | `expiry_date >= today` (query) / `filterLive` |
| Public counts | derived from the already-filtered pools | — |

The sitemap lists no individual offer detail routes, so it can never advertise
an expired permalink.

### 2. Scheduled archival (durable state)

[`run_daily_cleanup`](../supabase/migrations/019_pipeline_lifecycle_retention.sql)
runs every day via the `monitor-feeds` Vercel cron (`0 0 * * *`). It flips the
publication flag on every published/approved row whose `expiry_date < today`
(Sydney) — gift-card, cashback, points, weekly-deal and card offers, plus
OzBargain signals (`status = 'expired'`). It:

- runs **unconditionally**, *before* the OzBargain monitor/compliance gate, so
  archival still happens when monitoring is paused;
- is **idempotent** — the `where is_published = true and expiry_date < today`
  filter excludes already-archived rows, so a second run finds nothing;
- is **concurrency-safe** — the migration-016 one-running lock plus the
  lifecycle advisory lock serialise runs;
- **never deletes** — it only sets `is_published = false` / `status = 'expired'`;
- writes an **`audit_log`** row for every change (`auto-archive-expired`,
  `auto-archive-card`), preserving lineage and history.

Gift-card offers additionally have the richer
[`apply_gift_card_offer_lifecycle`](../supabase/migrations/032_gift_card_lifecycle_orchestration.sql)
RPC (7am Sydney, env-gated) that activates approved-future rows on their start
date, seals a history occurrence on archival, and audits both transitions.

### 3. Database / RLS enforcement (belt and suspenders)

Public `SELECT` policies bound visibility by the Sydney expiry date, so even a
future code path that forgot the read-time filter cannot serve an expired row:

- **`card_offers`** — migration 009 (live).
- **`gift_card_offers`** — migration 033 (applied): a confirmed row is visible
  only if it is currently active **or** a lineage-carrying `approved-future`
  ("upcoming") row, in both cases bounded by `expiry_date >= sydney_today`.
- **`cashback_offers` / `points_offers` / `weekly_deals` / `ozbargain_signals`**
  — migration 036 adds the same Sydney-inclusive bound. Authored and
  apply-gated per [`MIGRATION-SAFETY.md`](runbooks/MIGRATION-SAFETY.md); until
  applied, layers 1 and 2 already guarantee the behaviour (this layer only
  removes the theoretical sub-day window before the daily cleanup runs).

### 4. Monitoring + audit evidence

- [`/api/health/monitor`](../app/api/health/monitor/route.ts) fails (503) if the
  daily pipeline — which carries the archival — is stale (>26h), stuck or
  finished `error`/`partial`. `pipelineExpected` is always on, so this holds
  even when OzBargain monitoring is disabled.
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
- [`tests/monitor/dataHealthExpiry.test.ts`](../tests/monitor/dataHealthExpiry.test.ts)
  — the health verdict (any expired-but-published row → alert).
- Migration contracts for 019 (all-type Sydney archival + audit, no deletes),
  033 (upcoming arm) and 036 in
  [`tests/admin/migrationContracts.test.ts`](../tests/admin/migrationContracts.test.ts).
- Existing suites: `tests/stack/expiryGuard.test.ts`,
  `tests/giftcards/lifecycle.test.ts`, `tests/giftcards/lifecycleRoute.test.ts`
  (cron auth 401 + failure handling), `tests/admin/cleanup.test.ts`.
