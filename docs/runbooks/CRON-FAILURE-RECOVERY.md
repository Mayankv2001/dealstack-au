# Runbook — Cron failure recovery

Applies to all scheduled jobs. Schedulers: Vercel cron (`vercel.json`: monitor-feeds 00:00 UTC, recheck-expiry 12:00 UTC) and GitHub Actions (`gift-card-ingest.yml`, `gift-card-weekly-ingest.yml`, `gift-card-lifecycle.yml`, `gift-card-reconcile.yml`, `monitor-health.yml`). Every endpoint authenticates with `CRON_SECRET` (timing-safe bearer; missing secret ⇒ 503, wrong ⇒ 401) and returns machine-readable `skipped`/failure reasons.

## Symptoms
- GitHub Actions run red; `/admin/monitor` shows no run for the expected window; monitor-health workflow failing (that IS the alert channel); public data visibly ageing.

## Safe checks (read-only)
1. **Actions history:** repo → Actions → the workflow. Exit code 2 = the workflow could not read the `CRON_SECRET` repository secret — nothing was ever sent (known state 2026-07-13, DS-078; the Vercel value is unrecoverable — pull shows empty — so the secret must be re-entered manually from the source of truth).
2. **Run ledgers:** `/admin/monitor` and the gift-card job-run pages show per-run status; schema-unavailable appears as controlled 503s, not silence.
3. **Health endpoints** (bearer): `/api/health/monitor` — 200 with off/paused vs 503 on stall (>30h staleness); `/api/health/data` — 503 lists overdue reviews.
4. **Response body of the failed call** in the workflow log: only allowlisted summary keys are printed; look for `skipped` reasons: `environment-disabled`, `blocked-by-compliance`, `source-missing`, off-hour, interval-guard, lock-held.

## Probable causes, in observed order of likelihood
1. Actions `CRON_SECRET` secret missing/rotated-out (exit 2 pattern, all workflows at once).
2. Intentional pause: env flag off (`OZB_MONITOR_ENABLED`, `GCDB_INGEST_ENABLED`, `POINTHACKS_WEEKLY_INGEST_ENABLED`, `GIFT_CARD_RECONCILE_ENABLED`, `GIFT_CARD_LIFECYCLE_ENABLED`, `OZB_EXPIRY_RECHECK_ENABLED`) or DB source gate closed — this is *pause*, not failure; check `docs/runbooks/EMERGENCY-SOURCE-PAUSE.md` before "fixing" it.
3. GitHub schedule auto-disabled (~60 days repo inactivity — documented in `monitor-health.yml` header): Actions page shows "scheduled workflows disabled".
4. Both UTC fires of a Sydney-7am job failed (GH incident) — day skipped by the hour gate; see MANUAL-PIPELINE-REPLAY.
5. Genuine run failure: lock finalisation still releases (`runGuardedIngest` guarantees `fail`; migration-030 15-min stale-run takeover is the backstop) — read the run ledger error.

## Recovery options
- **Missed day / skipped window:** `docs/runbooks/MANUAL-PIPELINE-REPLAY.md` (workflow_dispatch + `?force=1` semantics — force bypasses only the run-hour gate; never auth, env flags, source gates, or the lifecycle local-day guard).
- **Stuck lock:** normally self-heals via the 15-minute takeover; if a run shows "running" for far longer, re-invoking after the takeover window is the recovery — do NOT hand-edit run rows.
- **Schedules disabled by GitHub:** re-enable in the Actions UI (any push also re-enables).

## Requires approval
- Re-entering/rotating `CRON_SECRET` (Vercel env + GitHub secret must be set to the same value; sensitive Vercel vars cannot be read back — record the change in the ops log).
- Changing `vercel.json` schedules (Hobby: max one cron/day per entry; never sub-daily).
- Flipping any `*_ENABLED` env flag.

## Never casually
- Deleting/editing job-run or lock rows in the database.
- Bypassing compliance/source gates by any means.
- Rotating the secret without simultaneously updating both sides.

## Validation after recovery
Next scheduled window produces a green workflow run AND a ledger row with `ok` status; `/api/health/monitor` 200-healthy; for gift-card jobs, the reconcile/lifecycle ledgers advance the following day.

## Escalation
Owner: (fill in). Source of truth for env values: (fill in — Vercel project settings; values are write-only).
