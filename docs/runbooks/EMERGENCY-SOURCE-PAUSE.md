# Runbook — Emergency source pause (and un-pause)

How to stop fetching from an external source immediately, in a way the system reports as *paused* rather than *broken*.

## When to pause
- Source owner objection, robots/terms change, suspected source poisoning (hostile feed content), legal/compliance question, or the source is serving garbage that would flood the review queues.

## Pause levers (fastest first)

1. **Environment flag (Vercel env, per job)** — flips the whole job off at the route gate; skip reason `environment-disabled`:
   - OzBargain monitor: `OZB_MONITOR_ENABLED` → unset/`false`
   - Offer detection post-step only: `OZB_OFFER_DETECT_ENABLED`; card-offer subset only: `CARD_DETECT_ENABLED`
   - Expiry recheck probes: `OZB_EXPIRY_RECHECK_ENABLED`
   - GCDB ingest: `GCDB_INGEST_ENABLED`
   - Point Hacks weekly: `POINTHACKS_WEEKLY_INGEST_ENABLED`
   - Reconcile / lifecycle (no external fetch, but pausable): `GIFT_CARD_RECONCILE_ENABLED`, `GIFT_CARD_LIFECYCLE_ENABLED`
   Env changes need a redeploy to take effect — factor that latency in.
2. **DB source gate (gift-card sources)** — per-source `enabled` / `automated_fetch_allowed` flags in the sources admin; skip reason distinguishes the gate. Use when only one source of several must stop. `?force=1` cannot bypass these.
3. **Compliance approval (OzBargain pipeline)** — the monitor checks a compliance approval gate before fetching; revoking it blocks with `blocked-by-compliance`.

Note the deliberate redundancy: for a serious incident set BOTH the env flag and the DB gate, so a later redeploy or env edit cannot silently resume fetching.

## What a pause does NOT do
- It does not unpublish anything already public. If bad data got published, that is an OFFER-ACCURACY-INCIDENT (separate runbook) — pausing only stops new intake.
- It does not stop read-time expiry filtering, lifecycle, or public pages — those keep running on existing data (pause lifecycle/reconcile separately only if the incident is *in* those jobs).

## How the pause reads on dashboards
- Workflows go green-with-skip (endpoint returns `skipped` + reason) — NOT red.
- `/api/health/monitor` returns 200 for off/paused states, 503 only for a stalled-while-enabled pipeline. If you see red after pausing, something else is wrong.
- Record the pause (who/why/when/expected duration) in the ops log and, for gift-card sources, the source notes field — "intentionally paused" must be discoverable later (REL-002 formalises the vocabulary).

## Un-pause
Reverse the specific levers you set (env + DB gate + compliance as applicable), redeploy if env changed, then run one supervised replay (MANUAL-PIPELINE-REPLAY) and review the run ledger + review-queue intake before walking away.

## Requires approval
- Pausing/un-pausing anything for compliance or legal reasons — the reviewer who imposed the pause approves the lift.
- Any change to compliance approval records.

## Never casually
- "Testing" an un-pause on production without watching the first run.
- Deleting staged rows that arrived before the pause — they are evidence; let review reject them.

## Validation
Paused: next scheduled window shows `skipped` with the intended reason and zero outbound fetches. Un-paused: green run, sane intake volume, no review-queue flood.

## Escalation
Compliance owner: (fill in). Source contacts: `docs/gift-card-source-policy.md`.
