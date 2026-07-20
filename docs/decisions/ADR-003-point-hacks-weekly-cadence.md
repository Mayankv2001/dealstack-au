# ADR-003 — Point Hacks ingest cadence: weekly means weekly

## Status
Proposed

## Context
The Point Hacks gift-card source is editorially updated weekly (Wednesdays, per `docs/gift-card-source-policy.md` and the `pointHacksWeekly` module naming), was permissioned as a weekly fetch, and the route is even named `gift-card-weekly-ingest`. But the route reuses the generic `decideSchedule` guard (`lib/giftcards/schedule.ts`, `RUN_INTERVAL_GUARD_HOURS = 40`) while its workflow fires daily at both Sydney-7am UTC slots — so the page can be fetched up to ~3×/week. Conditional GET softens the cost but each run still probes the origin. Evidence: `docs/audit/CRON-AND-SCHEDULING-AUDIT.md` CRON-F1.

## Decision
Proposed: the operating contract for this source is **at most one successful fetch per calendar week (Sydney), targeting Wednesday**, and the guard must encode it — either a ≥150h interval guard or an explicit Sydney-Wednesday day gate on top of the existing chain (auth → env → DB source gates → hour → interval → lock). Manual `?force=1` replays remain possible for a missed week but must not bypass auth/env/source gates (unchanged semantics).

A schedule contract test pins the cadence so the workflow's daily double-fire can never again translate into multi-weekly fetches.

## Alternatives considered
- **Leave the 40h guard** ("cheap thanks to conditional GET"): rejected — it mislabels the permissioned contract, and politeness to a manually-permissioned source is a trust matter, not a bandwidth one.
- **Change the GitHub workflow to fire weekly:** insufficient alone — the DST-safe design deliberately fires dumb-daily and lets the endpoint decide; encoding cadence in the workflow would regress that pattern and still allows manual/dispatch drift.

## Consequences
- Fetch behaviour matches the documented source permission; the "weekly" name becomes true.
- A fully missed Wednesday self-heals on `force` replay or (if the day-gate option is chosen) waits a week — the task must pick and document the missed-week behaviour.

## Risks
- Too-strict gating (exact-Wednesday + strict interval combined) could skip a week after one failure; the implementation must choose parameters so one missed fire recovers within the same week where possible.

## Follow-up tasks
- `tasks/cron/TASK-CRON-001-weekly-ingest-weekly-interval-guard.md` (implements the guard + contract test).
- `tasks/cron/TASK-CRON-002-missed-run-catchup-window.md` (general missed-window recovery; interacts — see its Parallelisation notes).
