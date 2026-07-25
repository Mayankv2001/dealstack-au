# Runbook — Manual pipeline replay

How to safely re-run a missed or failed scheduled job. All replays go through the same authenticated endpoints as the schedulers — there is no side door, and that is by design.

## When to replay
- A Sydney-7am gift-card window was fully missed (both UTC fires failed) — the hour gate blocks late organic runs.
- daily-cleanup missed its daily Vercel fire (Vercel incident).
- A run failed mid-way and the ledger shows `fail` (locks auto-release; a replay is safe).

## When NOT to replay
- The job was *skipped* with reason `environment-disabled`, `blocked-by-compliance`, or `source-missing` — that's an intentional pause; see EMERGENCY-SOURCE-PAUSE.
- A run is currently `running` and younger than the 15-minute stale-run takeover — wait.
- You are trying to make an ingest run more often than its permissioned cadence (Point Hacks is weekly — ADR-003).

## Replay mechanics

### Gift-card jobs (ingest / weekly-ingest / lifecycle / reconcile)
- GitHub → Actions → the matching workflow → Run workflow; or call the route with the bearer secret and `?force=1`.
- **What `force` does:** bypasses the Sydney-run-hour gate ONLY.
- **What `force` never does:** bypass auth, env flags, DB source gates (enabled + automated_fetch_allowed + terms/robots review), the interval guard's anti-storm intent, the one-running lock, or the lifecycle same-local-day guard (a second lifecycle run on the same Sydney date is a no-op by design — this is what makes replay safe).
- Order if replaying a whole missed day: ingest → (weekly-ingest if due per ADR-003) → reconcile (which fans into lifecycle). Reconcile/lifecycle are safe to run without a prior ingest — they act on current DB state.

### daily-cleanup
- No dedicated manual workflow; it self-heals at its next Vercel fire. If urgent, call `GET /api/cron/daily-cleanup` with the bearer secret. It is idempotent: already-unpublished rows no longer match its filters.

## Idempotency guarantees you are relying on
- One-running locks per source/kind (migration 030) with guaranteed finalisation (`lib/giftcards/runGuarded.ts`).
- Lifecycle: Sydney local-calendar-day idempotency, not bypassable.
- Interval guards measure from last run **start** for ingest/reconcile (a failed morning run suppresses same-day retry — expected; next day is the recovery unless you `force`).

## Requires approval
- Any replay that would fetch an external source more often than its documented cadence.
- Replays while a related incident (source outage, compliance question) is open.

## Never casually
- Editing run/lock rows to "unstick" anything.
- Replaying with modified code that hasn't passed the commit checklist.

## Validation after replay
Ledger row `ok`; `/api/health/monitor` healthy; for lifecycle, transitions logged (or an honest zero-transition entry) and public pages revalidated (the route revalidates even on zero-transition retries).

## Escalation
Owner: (fill in).
