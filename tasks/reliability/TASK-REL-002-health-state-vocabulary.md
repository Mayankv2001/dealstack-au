# TASK-REL-002 — One machine-readable health-state vocabulary across both health endpoints

## Status
Planned

## Priority
P2

## Workstream
REL — reliability & observability

## Problem statement
The two health endpoints answer "is it broken?" but not, in one consistent field, *which kind of not-broken or broken*:

- `/api/health/monitor` → `deriveMonitorHealth` returns `{ ok, reason, detail? }` with 200 for off/paused/fresh and 503 for stall/compliance/unreadable — good semantics, but the state lives in free-ish `reason` strings.
- `/api/health/data` → `getPublishedDataHealth` returns `{ ok, … }` with its own shape.
- The gift-card pipeline has *no* health surface yet (DS-072 owns adding its signals).

The audit mandate's bar: a health consumer must be able to distinguish `healthy | degraded | stale | intentionally-disabled | dependency-failure | configuration-error | unknown` without parsing prose. Today the monitor-health GH workflow can only key on HTTP status, so "paused on purpose" and "everything fresh" are the same green, and a future dashboard would have to hard-code reason strings.

Classification: Enhancement (existing behaviour is correct; the vocabulary is implicit and per-endpoint).

## User impact
Operator-facing only: faster, less error-prone incident triage; enables DS-071's status card and DS-073's workflow refinement to consume one enum instead of string-matching.

## Evidence
- `app/api/health/monitor/route.ts`, `lib/monitor/health.ts` (`deriveMonitorHealth` input/outputs; reasons include env-off, compliance, stale, running-overlong, parser failures, fetch anomalies).
- `app/api/health/data/route.ts`, `lib/admin/repos/dataHealth.ts`.
- `.github/workflows/monitor-health.yml` — consumes HTTP status only.

## Root cause or likely cause
Endpoints grew independently; no shared state type was ever declared.

## Scope
- Define one exported type in a shared module (e.g. `lib/observability/healthState.ts`): `type HealthState = "healthy" | "degraded" | "stale" | "disabled" | "dependency-failure" | "configuration-error" | "unknown"` with a documented mapping rule (HTTP status stays the alerting contract: healthy/disabled ⇒ 200; everything else ⇒ 503, preserving today's behaviour exactly).
- Map `deriveMonitorHealth` reasons onto it and add `state` to the monitor response (keep existing fields — additive, non-breaking).
- Add the same `state` field to `/api/health/data` (missing-secret → `configuration-error`, read failure → `dependency-failure`, threshold breaches → `degraded`/`stale` per existing checks).
- Unit-test the mapping exhaustively (every reason → exactly one state).

## Out of scope
- New signals or thresholds (DS-072 adds gift-card signals; it should adopt this vocabulary — note the dependency there).
- Changing any HTTP status or the workflow (DS-073 may later key on `state`).
- Dashboards/alert routing (DS-071/075).

## Relevant files
- `lib/monitor/health.ts`, `lib/admin/repos/dataHealth.ts`
- `app/api/health/monitor/route.ts`, `app/api/health/data/route.ts`
- New: `lib/observability/healthState.ts`
- `tests/monitor/` health tests, `tests/admin/` dataHealth tests

## Data and schema considerations
None.

## Security considerations
Endpoints stay bearer-gated, `no-store`; the new field must not carry raw error text (states only; detail keeps flowing to operational reporting).

## Implementation plan
1. Enumerate every reachable `reason`/branch in both health modules (from code + tests).
2. Write the mapping table in the new module's docblock, then the code, then exhaustive tests.
3. Thread `state` through both routes additively.

## Required tests
- Mapping unit tests: every existing reason/branch produces the intended state; unknown/unexpected input → `"unknown"` (and 503).
- Route tests updated to assert `state` presence alongside unchanged statuses.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:monitor && npm run test:admin && npm run build
```

## Manual verification
Optional operator step post-deploy: curl both endpoints (with bearer) and eyeball the `state` field. Read-only.

## Production safety
Additive response field; statuses unchanged, so existing alerting cannot regress.

## Dependencies
None. DS-072/DS-073 should build on this — sequence this first if those are picked up.

## Parallelisation notes
Touches health modules only; conflicts with nothing else in this programme.

## Rollback or recovery
Revert commit; the field disappears, consumers keying on HTTP status unaffected.

## Acceptance criteria
- Both endpoints return `state` from the shared enum; mapping is exhaustive and unit-tested; no status-code changes; intentionally-disabled is distinguishable from healthy and from every failure state.

## Definition of done
Criteria met; mapping table included in the report; validation output reported.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, both health routes, `lib/monitor/health.ts`, `lib/admin/repos/dataHealth.ts`, and their tests.
2. Verify no `state` field already exists; if DS-072 landed something equivalent, reconcile instead of duplicating and report the overlap.
3. Check `git status`; preserve unrelated work.

During implementation:
- Additive only: never change an HTTP status or remove a field; never put raw error text in `state` or new fields.
- Do not commit, push, migrate, deploy, or call production endpoints.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:monitor && npm run test:admin && npm run build`.
- Report the final reason→state mapping, changed files, and test results.
