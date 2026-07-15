# TASK-15 — Monitoring and health for the gift-card system

## Goal
Machine-readable health for weekly ingest, daily reconciliation, lifecycle,
and acceptance — distinguishing intentional disablement from failure.

## Scope
- New bearer-gated `app/api/health/gift-cards/route.ts` (mirror the auth and
  503 semantics of `app/api/health/monitor/route.ts`) reporting, as JSON:
  per-source last run (id, kind, status, started, ages), source state
  classified as `disabled-by-intent | fetch-not-permitted |
  temporary-failure | parse-failure | ok | stale`, candidate backlog counts
  (new / material-change / acceptance / unresolved-alias), offers due to
  activate (next 7 days), offers due to expire (next 7 days),
  `expired_still_visible` count (must be 0 — 503 if not), published offers
  without valid evidence, stale acceptance count, lock failures /
  stuck-running runs, DST-gate skip counts, duplicate reconciliation
  detection (two non-skipped runs same local day → error).
- Pure classification logic in `lib/giftcards/health.ts` (new), following
  `lib/monitor/health.ts` conventions; repo queries in
  `lib/admin/repos/giftCardPipeline.ts` / `giftCardAcceptance.ts`.
- Extend `.github/workflows/monitor-health.yml` to also poll the new route
  (same exit-2-when-blind convention). Optionally extend
  `lib/admin/repos/dataHealth.ts` counts for acceptance staleness.
- Admin ops surface: add the health summary to the existing
  `/admin/gift-cards` ops area (read-only card).

## Files likely involved
`app/api/health/gift-cards/route.ts` (new), `lib/giftcards/health.ts` (new),
`lib/admin/repos/giftCardPipeline.ts`, `giftCardAcceptance.ts`,
`lib/admin/repos/dataHealth.ts`, `.github/workflows/monitor-health.yml`,
`app/admin/(protected)/gift-cards/page.tsx`,
`tests/giftcards/health.test.ts` (new).

## Dependencies
TASK-05 (runs to observe), TASK-10 (acceptance staleness). Wave 5.

## Inputs
Plan §10; `lib/monitor/health.ts` + its tests; `monitor-health.yml`.

## Exact deliverables
Health route + pure classifier + workflow poll + ops card + tests.

## Constraints
- 503 on: unreadable state, expired-but-visible > 0, silent stall beyond
  threshold; 200 with explicit `disabled-by-intent` when gates are closed —
  closed gates are healthy, not failing.
- No secrets in responses; counts only, no offer payloads.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Each source-state classification; expired-visible triggers 503;
closed-gate = healthy; stuck-run detection; duplicate-local-day detection;
auth behaviour.

## Acceptance criteria
Every failure mode in plan §10 distinguishable from the JSON alone.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npm run test:admin && npx tsc --noEmit`

## Non-goals
Alerting integrations; dashboards; changing monitor health for OzBargain.
