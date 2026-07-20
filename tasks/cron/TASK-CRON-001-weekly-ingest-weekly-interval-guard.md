# TASK-CRON-001 — Give the Point Hacks weekly ingest a genuinely weekly schedule guard

## Status
Planned

## Priority
P1

## Workstream
CRON — scheduling & pipelines

## Problem statement
`/api/cron/gift-card-weekly-ingest` describes itself (and its workflow, env flags and source policy docs) as a **weekly** ingest of the Point Hacks weekly-gift-card-offers editorial page. But the route reuses `decideSchedule` from `lib/giftcards/schedule.ts`, whose interval guard is `RUN_INTERVAL_GUARD_HOURS = 40` — the *every-other-day* guard designed for the GCDB feed. With `gift-card-weekly-ingest.yml` firing daily at both Sydney-7am UTC slots, the source can be fetched up to ~3×/week once enabled.

Classification: Probable defect — the code contradicts the documented weekly contract; it is possible (but nowhere stated) that sub-weekly polling was intended to catch mid-week corrections.

## User impact
None visible directly. The risk is to source relations and compliance posture: this source's automated retrieval was manually permissioned (terms/robots review recorded per `decideAutomatedRetrieval` gates) under a weekly framing; quietly fetching 3×/week over-reaches that permission. Freshness for users is unaffected either way (candidates still await admin review).

## Evidence
- `app/api/cron/gift-card-weekly-ingest/route.ts` (~line 654): `const schedule = decideSchedule(now, lastStart, { force });`
- `lib/giftcards/schedule.ts:19-20`: `RUN_INTERVAL_GUARD_HOURS = 40` documented as "every other day".
- `.github/workflows/gift-card-weekly-ingest.yml`: fires daily at `0 20 * * *` and `0 21 * * *`; header text says "runs only when … the last real run started ≥ the interval guard ago" — inheriting the wrong interval.
- Weekly framing: source id `pointhacks_weekly_gift_cards`, `lib/giftcards/pointHacksWeekly.ts`, `docs/gift-card-source-policy.md`, exact-path allowlist `isApprovedPointHacksWeeklyUrl` (`lib/security/urlPolicy.ts`).

## Root cause or likely cause
Route assembled from the GCDB ingest template; the schedule decision was reused wholesale instead of being parameterised per source cadence.

## Scope
- Add a weekly decision to `lib/giftcards/schedule.ts` — either `decideWeeklySchedule(now, lastStart, {force})` with a ≥150h guard (tolerates scheduler jitter while meaning "once per week"), or a Sydney-day-of-week gate (run only when Sydney date is Wednesday) if inspection of `pointHacksWeekly.ts`/docs confirms Wednesday publication is the contract. Prefer the interval form unless the Wednesday contract is explicit — day-gates lose a whole week on a single missed day.
- Use it in the weekly-ingest route; `?force=1` keeps bypassing only the hour gate (never the interval), matching the existing convention.
- Update the workflow header comment and any docs stating the cadence.

## Out of scope
- GCDB ingest cadence (correct as designed).
- Enabling the source (stays default-off; this task must not touch env flags or DB source rows).
- Reconcile/lifecycle schedules.

## Relevant files
- `lib/giftcards/schedule.ts`
- `app/api/cron/gift-card-weekly-ingest/route.ts`
- `.github/workflows/gift-card-weekly-ingest.yml` (comment only; schedule lines unchanged)
- `tests/giftcards/` schedule + weekly-ingest route tests
- Reference: `lib/giftcards/pointHacksWeekly.ts`, `docs/gift-card-source-policy.md`

## Data and schema considerations
None — guard reads the existing run ledger (`lastIngestRunStart`).

## Security considerations
Reduces outbound request frequency to a manually-permissioned host; no gate is weakened. Verify `force` still cannot bypass env/DB/permission gates.

## Implementation plan
1. Verify the mismatch still exists; read `pointHacksWeekly.ts` + source-policy doc for an explicit publication-day contract.
2. Implement the chosen guard as a pure function with the same decision-shape as `decideSchedule` (machine-readable skip reasons, e.g. `weekly-interval-guard`).
3. Wire into the route; keep the Sydney-7am hour gate.
4. Update workflow/docs comments.

## Required tests
- Unit (`tests/giftcards/schedule…`): runs at 7am Sydney with lastStart 8 days ago; skips with lastStart 3 days ago; DST-boundary instants (AEDT↔AEST transition days) neither double-run nor skip a week; `force` bypasses hour but not interval.
- Route test: weekly route returns `skipped: "<new reason>"` under the guard; gate ORDER unchanged (auth → env → source gates → hour → interval → lock).

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run build
```

## Manual verification
None required pre-merge. Post-deploy (operator, separate approval): observe two consecutive scheduled days' workflow logs — first fire runs (or skips per interval), second fire skips with the weekly reason.

## Production safety
Route is default-off (`POINTHACKS_WEEKLY_INGEST_ENABLED` unset ⇒ safe no-op). Change only tightens frequency. Agent must not enable any source, edit env, or call production endpoints.

## Dependencies
None.

## Parallelisation notes
Touches `lib/giftcards/schedule.ts` — coordinate with TASK-CRON-002 (same file); run these two sequentially.

## Rollback or recovery
Revert commit; behaviour returns to the 40h guard. No data migration involved.

## Acceptance criteria
- Enabled-state simulation (tests) shows at most one real run per 7-day window under daily double-slot firing, across DST transitions.
- All existing schedule/route tests green; skip reasons remain machine-readable.
- Workflow/doc comments match the implemented cadence.

## Definition of done
Criteria met; validation output reported; cadence decision (interval vs Wednesday gate) justified in the report with the evidence found.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file, `lib/giftcards/schedule.ts`, the weekly-ingest route, its workflow, and `lib/giftcards/pointHacksWeekly.ts`.
2. Verify the route still uses the 40h `decideSchedule` guard; if it already has a weekly guard, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Add a pure weekly schedule decision + tests; wire it into the weekly route only.
- Never weaken auth, env flags, DB source gates, or the rule that `force` bypasses only the run-hour.
- Do not enable any source, change env, or call any production endpoint.
- Do not commit, push, migrate, or deploy.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run build`.
- Report root cause, changed files, test results, the cadence rationale, and anything unverified (e.g. production observation steps left for the operator).
