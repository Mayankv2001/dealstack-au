# TASK-REL-001 — Stop the monitor-feeds cron from echoing raw internal error messages

## Status
Planned

## Priority
P2

## Workstream
REL — reliability & observability

## Problem statement
`app/api/cron/monitor-feeds/route.ts` returns internal error detail to the caller in two places:

1. Catch path: `return Response.json({ ok: false, ran: false, error: errMessage(error) }, { status: 500 })` — the raw exception message.
2. Success path: `...(complianceError ? { complianceError } : {})` — the raw compliance-check exception message.

Every sibling cron route deliberately returns a fixed string instead ("gift-card ingest failed", "recheck run failed") and the recheck route documents the convention: "never echo a raw internal message". The manual GH workflow (`monitor-feeds-trigger.yml`) prints selected response keys into public run logs, so a Supabase error string (which can contain table/RPC names or connection detail) can end up publicly visible.

Classification: Confirmed defect (hygiene/inconsistency; low direct risk since callers must hold CRON_SECRET).

## User impact
None direct. Reduces accidental internal-detail exposure in public CI logs and keeps the error-handling convention uniform so future routes copy the safe pattern.

## Evidence
- `app/api/cron/monitor-feeds/route.ts` — `errMessage()` helper and both call sites (~lines 787–789, 896, 905).
- Contrast: `app/api/cron/recheck-ozbargain-expiry/route.ts` catch path comment + fixed string; same in all four gift-card routes.
- `.github/workflows/monitor-feeds-trigger.yml` prints `data.get(k)` for summary keys.

## Root cause or likely cause
monitor-feeds is the oldest cron route; the fixed-string convention was adopted in later routes and never backported.

## Scope
- Replace the catch-path body with a fixed string (`"daily pipeline run failed"`); keep the full error going to `reportOperationalError` (already does).
- Replace `complianceError` passthrough with a boolean/enum (e.g. `complianceCheckFailed: true`); the detail already goes to `reportOperationalError("pipeline-compliance-check", …)`.
- Check the summary spread (`...summary`) for any field carrying raw error strings (`summary.errors` from `runDailyPipeline`) — if `errors` contains raw messages, replace with `errorCount` in the response (mirroring the recheck route's "counts and status only" contract) while keeping full detail in the run ledger/observability.
- Update the GH workflow's key allowlist if a key is renamed.

## Out of scope
- Any behaviour change to the pipeline itself, gates, locks, scheduling.
- Other routes (already conformant).
- DS-085 (shared bearer-auth helper) — separate concern, don't bundle.

## Relevant files
- `app/api/cron/monitor-feeds/route.ts`
- `lib/monitor/runDailyPipeline.ts` (read: summary shape)
- `tests/monitor/` route/pipeline tests
- `.github/workflows/monitor-feeds-trigger.yml`

## Data and schema considerations
None. Run-ledger writes (which legitimately store error detail) are unchanged.

## Security considerations
This IS the security consideration: response minimisation. Ensure no new field leaks; ensure observability still receives full detail (do not blind the operator to fix the log).

## Implementation plan
1. Verify the current response shapes with the existing route tests (add a failing test first: thrown pipeline error ⇒ fixed-string body, no raw message).
2. Apply the three response changes; keep HTTP statuses identical.
3. Align the workflow key list.

## Required tests
- `tests/monitor/`: catch path returns `{ error: "daily pipeline run failed" }` and never the thrown message; compliance-failure run includes the boolean, not the string; partial/error summaries expose `errorCount` not raw `errors` (if that change is made).
- All existing monitor tests green.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:monitor && npm run build
```

## Manual verification
None required; the workflow-log improvement can be observed on the next manual dispatch (operator).

## Production safety
Response-shape change only, to an endpoint consumed by our own workflow and operators; statuses unchanged so health/alert behaviour is unaffected. No gates touched.

## Dependencies
None.

## Parallelisation notes
Only touches monitor-feeds route + its tests; safe with everything else in this programme.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- No code path in the route can place a thrown-error message or exception text into the HTTP response body.
- Operational reporting still receives the full detail (test-asserted).
- Workflow prints only still-existing keys.

## Definition of done
Criteria met; validation output and changed files reported.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file, the monitor-feeds route, `lib/monitor/runDailyPipeline.ts` (summary shape), and the monitor route tests.
2. Verify the raw-message echoes still exist; if already fixed, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Smallest complete change; keep HTTP statuses and all gate/lock behaviour identical; keep full detail flowing to reportOperationalError and the run ledger.
- Do not touch other routes; no unrelated refactoring.
- Do not commit, push, migrate, deploy, or call production endpoints.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:monitor && npm run build`.
- Report changed files, test results, and remaining risks.
