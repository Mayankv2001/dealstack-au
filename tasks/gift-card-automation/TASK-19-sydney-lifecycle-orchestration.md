# TASK-19 — Sydney 07:00 lifecycle orchestration

## Goal
Add a DST-safe, once-per-Sydney-local-day job that activates only previously
approved future-dated offers whose confirmed start has arrived and archives
confirmed expired offers while preserving history, evidence and audit.

## Root cause
The current ingest schedule uses a 40-hour every-other-day guard and only
stages source candidates. No job calls `planLifecycle()` or seals history, so
approved future offers do not activate at 07:00 and expired offers are not
automatically removed from active surfaces.

## Scope
- Add a pure Sydney local-date gate separate from the legacy GCDB 40-hour gate.
- Add an authenticated, default-off lifecycle route and job-run registration
  (`run_kind='activate-archive'`) using the existing global lock and stale-run
  protection.
- Atomically activate/archive approved offers; seal expired structured history;
  preserve evidence/revisions; audit each transition; revalidate all public
  gift-card/search/store/deal paths.
- Add a dual-UTC GitHub trigger with non-conflicting minute offsets relative to
  other gift-card jobs. Do not add or enable a production cron secret/gate.

## Dependencies
TASK-03, TASK-05, migrations 023/025/030.

## Files likely involved
`lib/giftcards/schedule.ts`, `lifecycle.ts`, admin lifecycle repo, new
`app/api/cron/gift-card-lifecycle/route.ts`, `.github/workflows/`, `.env.example`,
route/schedule/lifecycle tests.

## Exact deliverables
Pure local-day decision, real lifecycle persistence boundary, route, workflow,
structured result and focused tests.

## Required tests
AEST/AEDT dual slots; 2026-10-04 transition; same-local-day duplicate;
lock contention; stale-run takeover; retry idempotency; before-start hidden;
at-start activation; after-expiry archive+history; unknown date untouched;
ongoing untouched; audit/cache calls; missing migrations controlled.

## Acceptance criteria
The weekly activation demonstration passes with a fixed clock and a second
same-local-day call performs no writes. No candidate can become public.

## Validation commands
`nvm use 20 && npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run test:admin && git diff --check`

## Non-goals
Fetching sources, automatic candidate approval, applying migrations, enabling
the lifecycle flag.

## Safety
Do not commit, push, deploy, apply migrations, enable jobs, or change
production data.
