# TASK-05 — Weekly 07:00 and daily reconciliation orchestration

## Goal
Wire lifecycle + reconciliation into bearer-gated cron routes with the
established lock/guard/schedule pattern, plus the GitHub workflows that fire
them. Nothing enabled.

## Scope
- Extend the 07:00 weekly path: after the existing Point Hacks ingest steps,
  run TASK-03 activation + archive + `revalidatePath` for `/gift-cards`,
  homepage, and affected store pages. Decide (inspect first) whether this
  lives inside `gift-card-weekly-ingest/route.ts` as ordered steps or a
  sibling route `gift-card-daily-lifecycle`; prefer one route with ordered,
  independently-skippable steps and one structured JSON result.
- New `app/api/cron/gift-card-reconcile/route.ts`: timing-safe bearer auth →
  env-flag gate (`GIFT_CARD_RECONCILE_ENABLED`, default off) → once-per-day
  guard (≥20h, via run registry `run_kind='reconcile'`) → run TASK-04 engine
  over stored raw/source state (fetch only through already-permitted, gated
  source adapters — a closed source contributes `source-unavailable`) → apply:
  auto-refresh non-material, stage material candidates, hand `expired` to the
  archive path, record prediction outcomes → structured JSON result.
- Locking: reuse `runGuarded.ts` + the per-`(source, run_kind)` one-running
  index (030). Max-run-age protection: a `running` row older than the route
  `maxDuration` is finalised as `error` before acquiring.
- New `.github/workflows/gift-card-weekly-ingest.yml` (dual UTC 20:00/21:00,
  mirrors `gift-card-ingest.yml`) and `gift-card-reconcile.yml` (single daily
  slot, e.g. 23:00 UTC ≈ 9–10am Sydney). Workflows fire into closed gates —
  copy the exit-code and reporting conventions of `gift-card-ingest.yml`.
- Add env accessors in `lib/env.ts` (default off), document in `.env.example`.
- **Do not modify `vercel.json`.**

## Files likely involved
`app/api/cron/gift-card-weekly-ingest/route.ts`,
`app/api/cron/gift-card-reconcile/route.ts` (new), `lib/env.ts`,
`lib/giftcards/runGuarded.ts` (only if max-run-age needs adding),
`.github/workflows/gift-card-weekly-ingest.yml` (new),
`.github/workflows/gift-card-reconcile.yml` (new), `.env.example`,
`tests/giftcards/reconcileRoute.test.ts` (new),
`tests/giftcards/weeklyIngestRoute.test.ts` (extend).

## Dependencies
TASK-03, TASK-04. Migration 030 shape (degrade honestly). Wave 2.

## Inputs
Plan §5; `giftCardIngestRoute.test.ts` route-testing pattern; `schedule.ts`.

## Exact deliverables
Routes + workflows + env plumbing + tests. All gates default-off.

## Constraints
- Auth identical to existing routes (timing-safe, 503 on unset secret).
- `?force=1` may bypass only the run-hour gate — never auth, env, DB gates,
  or interval guard.
- Reconciliation must never fetch from a source whose gates are closed.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Auth (401/503); env-off no-op; once-per-day guard; lock contention returns
skip; stuck-run finalisation; step isolation (activation failure doesn't block
archive; one source's failure doesn't abort others); structured result shape;
`force` semantics.

## Acceptance criteria
All tests green; both workflows lint (actionlint-style visual check); zero
gates opened; `vercel.json` untouched.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Enabling anything; monitoring endpoints (TASK-15); acceptance reconciliation
(TASK-10).
