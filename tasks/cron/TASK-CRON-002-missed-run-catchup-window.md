# TASK-CRON-002 — Bounded catch-up window for missed Sydney-7am gift-card runs

## Status
Planned

## Priority
P2

## Workstream
CRON — scheduling & pipelines

## Problem statement
The gift-card ingest, weekly ingest and lifecycle jobs accept invocations only during the 7 o'clock hour in Australia/Sydney (`isSydneyRunHour`, `lib/giftcards/schedule.ts`). The external scheduler (GitHub Actions) fires at both UTC equivalents, but if **both** fires fail — GitHub incident, Vercel deploy outage, schedules auto-disabled after repo inactivity — the whole local day is silently lost: any later invocation is rejected `outside-run-hour`, and nothing retries. Recovery today is manual (`workflow_dispatch` + `?force=1`).

The lifecycle job is the sharpest edge: a missed day delays activation of starting offers and archival of expired offers by up to 24h (public *display* stays correct via read-time expiry filters, but ledgers, history sealing and cache revalidation lag).

Classification: Design weakness (single-hour gate with no automated catch-up). The failure mode is real but requires a full dual-slot outage; the code behaves exactly as designed.

## User impact
During a missed lifecycle day: newly-starting offers do not activate until the next morning; archived state and offer history lag. During a missed ingest day: candidate freshness slips ~24–48h. No incorrect data is shown either way.

## Evidence
- `lib/giftcards/schedule.ts`: `decideSchedule` and `decideDailyLifecycleSchedule` both reject when `!isSydneyRunHour(now)` unless `force`.
- `.github/workflows/monitor-health.yml` header documents the ~60-day schedule auto-disable risk.
- `decideDailyLifecycleSchedule` already carries the correct idempotency key (Sydney local date, keyed on last **successful** run) — a wider window cannot double-run.

## Root cause or likely cause
The hour gate exists to make the daily double-slot UTC firing pattern safe; a catch-up window was simply never added on top.

## Scope
- Lifecycle (and, with the same pattern, the two ingests): widen acceptance from "hour == 7" to a bounded window "hour ≥ 7" **for the same Sydney date**, i.e. accept a late invocation any time later that local day when no successful run has happened for that date. The existing same-local-day guard already provides idempotency; the interval guards (40h / TASK-CRON-001 weekly) already prevent extra ingest runs.
- Add a scheduled third "sweeper" fire to the lifecycle + ingest workflows at ~13:00 UTC (≈ 23:00–24:00 Sydney) so a missed morning self-heals the same day without human action. Keep `workflow_dispatch` for manual replay.
- Preserve exact `force` semantics (bypasses hour/window only).
- Update workflow header comments and `docs/runbooks/MANUAL-PIPELINE-REPLAY.md` cross-reference.

## Out of scope
- monitor-feeds and recheck routes (no hour gates; Vercel-scheduled).
- Any alerting change (monitor-health workflow already reddens on stall; DS-071/072 own richer signals).
- Changing `vercel.json` (Hobby limits; both slots used — the sweeper goes in GH Actions only).

## Relevant files
- `lib/giftcards/schedule.ts`
- `app/api/cron/gift-card-lifecycle/route.ts`, `.../gift-card-ingest/route.ts`, `.../gift-card-weekly-ingest/route.ts` (wiring only)
- `.github/workflows/gift-card-lifecycle.yml`, `gift-card-ingest.yml`, `gift-card-weekly-ingest.yml`
- `tests/giftcards/` schedule + route tests

## Data and schema considerations
None — reuses existing run ledgers and local-day comparison.

## Security considerations
The sweeper fire uses the same secret-gated endpoints; no gate weakened. Slightly more authenticated no-op traffic on healthy days (one extra skip response per job).

## Implementation plan
1. Verify current behaviour via the schedule tests; write failing tests for the late-window cases first.
2. Extend the decision functions: `run` when Sydney hour ≥ RUN_HOUR **and** the local-date guard passes (lifecycle) / interval guard passes (ingests). Return a distinct reason (`caught-up-late-window`? keep `run: true` but include the window in the decision for observability) — keep the decision shape backward-compatible.
3. Add the sweeper cron lines + comment updates to the three workflows.
4. Update the replay runbook cross-reference.

## Required tests
- Late same-day invocation after a missed morning runs exactly once (lifecycle: date-keyed; ingest: interval-keyed).
- Healthy day: morning run happens; sweeper invocation skips (`already-ran-local-day` / `interval-guard`).
- DST transition days behave (23h/25h days): no double-run, no skipped date.
- Hour-before-7 (e.g. 02:00 Sydney) still rejects.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run build
```

## Manual verification
Operator, post-deploy: confirm the new sweeper fire appears in Actions and returns a skip on a healthy day.

## Production safety
All affected endpoints are default-off; behaviour change is acceptance-window widening under existing idempotency guards. No source enablement, no env change, no production calls by the agent.

## Dependencies
Sequence after TASK-CRON-001 (both edit `lib/giftcards/schedule.ts` and the same tests).

## Parallelisation notes
Do not run concurrently with TASK-CRON-001. Independent of everything else.

## Rollback or recovery
Revert commit; remove sweeper cron lines. No data effects.

## Acceptance criteria
- Simulated dual-slot outage + sweeper fire ⇒ the day's run completes (tests prove it).
- No scenario in the test matrix produces two real runs for one Sydney date.
- Workflows document the third fire; `force` semantics unchanged.

## Definition of done
Criteria met; validation output reported; the outage→self-heal scenario described in the report with the exact test names covering it.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file, `lib/giftcards/schedule.ts`, the three routes and three workflows, and the existing schedule tests.
2. Verify TASK-CRON-001's weekly guard state first (this task builds on the same file; if CRON-001 is unmerged, coordinate or stop and report).
3. Check `git status`; preserve unrelated work.

During implementation:
- Tests first; smallest complete change; keep decision shapes and skip reasons machine-readable.
- Never weaken auth, env flags, source gates, or idempotency guards; `force` continues to bypass only the hour/window.
- Do not enable sources, change env, or call production endpoints.
- Do not commit, push, migrate, or deploy.

After implementation:
- Run the validation commands; report changed files, test results, and the operator steps that remain (Actions observation).
