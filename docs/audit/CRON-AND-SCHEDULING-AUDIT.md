# Cron & Scheduling Audit

> Audit date: 2026-07-19 · HEAD `9b7365f` · Read-only.

## Inventory

| Job | Trigger | Guards (in order) | Lock | Default |
|---|---|---|---|---|
| monitor-feeds | Vercel cron 00:00 UTC (+ manual GH dispatch) | secret → env kill-switch → compliance approval → UA | pipeline run lock (migration 016) | on when env set |
| recheck-ozbargain-expiry | Vercel cron 12:00 UTC | secret → env flag → compliance → UA → interval | own lock (migration 020) | off |
| gift-card-ingest | GH Actions 20:00/21:00 UTC daily | secret → env flag → DB source gates (enabled + automated_fetch_allowed + terms/robots reviews) → Sydney-7am hour → 40h interval → lock | source/kind run lock (030) | off |
| gift-card-weekly-ingest | GH Actions 20:00/21:00 UTC daily | same chain; **same 40h guard** | same | off |
| gift-card-lifecycle | GH Actions 20:07/21:07 UTC | secret → env flag → Sydney-7am hour → same-local-day idempotency | lifecycle run + migration-030 stale-run takeover | off |
| gift-card-reconcile | GH Actions 23:00 UTC | secret → env flag → ≥min-interval-hours | source/kind lock; fenced against activate/archive | off |
| monitor-health probe | GH Actions every 3h | bearer to own health endpoint | n/a (read-only) | on |

## What is done well (verified)

- **DST safety:** Sydney times derived via `Intl` with the IANA zone (`lib/giftcards/schedule.ts`), never fixed offsets; schedulers fire at *both* UTC equivalents and let the endpoint decide. The lifecycle guard compares Sydney **calendar dates**, so 23/25-hour days cannot double-run or skip.
- **Idempotency & duplicate execution:** every ingest-shaped job holds a DB one-running lock; duplicate/off-hour calls return machine-readable `skipped` reasons. `decideDailyLifecycleSchedule`'s local-day guard is not bypassable by `?force=1`.
- **Stuck-run recovery:** `runGuardedIngest` guarantees finalisation (`fail` releases the lock even when observability fails); migration 030's 15-minute stale-run takeover is the backstop — verified in route comments and `lib/giftcards/runGuarded.ts` invariants (unit-tested).
- **Auth:** all seven entry points use timing-safe bearer comparison; missing secret → 503 (visible), wrong secret → 401. No route trusts query params for auth; `?force=1` never bypasses auth, env flags, or interval guards.
- **Blind-trigger detection:** every workflow exits 2 (red) when the Actions `CRON_SECRET` secret is missing, by design.
- **Log hygiene:** workflows print only allowlisted summary keys, never raw bodies (public repo).

## Findings

### CRON-F1 — "Weekly" ingest cadence is every-other-day *(Probable defect)*
`gift-card-weekly-ingest/route.ts` reuses `decideSchedule` with `RUN_INTERVAL_GUARD_HOURS = 40`. With the workflow firing daily at both slots, the Point Hacks editorial page is fetched up to ~3×/week, against a weekly-update source and a "weekly" operating contract. Conditional GET (etag/last-modified) reduces cost but each run still probes the origin. → **TASK-CRON-001** (introduce a weekly guard, e.g. ≥150h or Sydney-Wednesday gate).

### CRON-F2 — No automated catch-up after a fully missed Sydney-7am window *(Design weakness)*
If both UTC fires fail (GH incident, Vercel outage) the ingest/lifecycle day is skipped: the hour gate rejects any later invocation and nothing retries. Manual recovery exists (`workflow_dispatch` + endpoint `?force=1`, which bypasses only the hour gate) but requires a human to notice. Reconcile (no hour gate) and monitor-feeds (any-time route) are unaffected. → **TASK-CRON-002** (bounded late-window acceptance or documented automated retry), plus runbook `docs/runbooks/MANUAL-PIPELINE-REPLAY.md`.

### CRON-F3 — Scheduled-trigger liveness is unverified from the repo *(Missing verification)*
Three external facts decide whether any of this runs at all: (1) the Actions `CRON_SECRET` secret exists (2026-07-13 evidence said it did **not** — every scheduled workflow red with exit 2; DS-078); (2) GitHub disables schedules after ~60 days without repo activity (documented in `monitor-health.yml` header); (3) Vercel cron execution on Hobby has minute-level jitter. → **TASK-CRON-003**: production observation checklist + green-run confirmation.

### CRON-F4 — Interval guard counts failed runs for reconcile/ingest *(Design note, acceptable)*
`lastIngestRunStart`/`lastReconcileRunStart` measure from the last run **start** regardless of outcome, so a crashed 07:00 run suppresses a retry at 07:59 (interval) and the next chance is the following day. This is a deliberate anti-storm choice; the lifecycle job, by contrast, keys on last **successful** run and so self-heals next window. Documented in the runbooks; no code task raised (revisit only if a real missed day occurs).

### CRON-F5 — monitor-feeds error echo *(Confirmed, hygiene)*
See CURRENT-STATE-AUDIT finding 4 → **TASK-REL-001**.

### CRON-F6 — Emergency pause vs failure are distinguishable, but only via reasons *(Enhancement)*
Skip reasons (`environment-disabled`, `blocked-by-compliance`, `source-missing`, permission reasons) do distinguish intentional pause from breakage, and `/api/health/monitor` returns 200 for "off/paused" vs 503 for stall. The gift-card pipeline's health signals are thinner (DS-071/072/073 already ticketed). → cross-reference only; no new task.

## Schedule contract tests

`tests/giftcards/` contains schedule and DST tests (Sydney run-hour guard, local-day guard) and route-level gate tests (e.g. `reconcileRoute.test.ts`, `lifecycleRoute.test.ts`) — present and green. The weekly-cadence contract of CRON-F1 is the missing case; TASK-CRON-001 adds it.
