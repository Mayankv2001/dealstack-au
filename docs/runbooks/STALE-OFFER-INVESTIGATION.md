# Runbook — Stale offer investigation

For when public offers look old: ageing `last checked` labels, "needs re-check" badges everywhere, or a user/operator reports that an offer's terms no longer match the retailer.

## Symptoms
- Freshness labels sliding into "Needs re-check"/"Not yet checked" (`lib/freshness.ts`, 7-day window) across many offers at once.
- Stack cards showing 21-day stale-data warnings (`lib/stack/compatibility.ts`, `STALE_DATA_DAYS = 21`).
- `/api/health/data` 503 listing overdue reviews.

## Key distinction first
**Stale ≠ expired.** Expired offers are filtered at read time on every public path regardless of cron health (see EXPIRED-OFFER-INCIDENT). Staleness means *verification* is old, and the site already displays that honestly. The incident, if any, is in the pipelines that refresh verification — or simply an unworked review queue.

## Safe checks (read-only)
1. Scope: one offer, one source, or everything? One offer ⇒ likely just needs re-verification (admin queue). Everything from one source ⇒ that source's pipeline. Everything ⇒ scheduler/secret problem.
2. Job ledgers (`/admin/monitor`, gift-card job runs): when did each enabled job last run `ok`?
3. Actions history: green/red/skip pattern for the relevant workflow (CRON-FAILURE-RECOVERY has the decode table).
4. Reconcile ledger: the daily gift-card reconcile is what refreshes source-presence conclusions (`runReconcile`); check its last outcome and taxonomy counts.
5. Source gates: is the source intentionally paused (env flag / DB gate / compliance)? Then staleness is *expected* — the question becomes whether the pause should continue (EMERGENCY-SOURCE-PAUSE).
6. Review queues: staged changes may be waiting for a human — staleness caused by unreviewed work is an operations bandwidth issue, not a code one.

## Probable causes
1. Scheduled jobs not running at all (secret/schedule — most likely, given the 2026-07-13 evidence of a missing Actions secret).
2. Source intentionally paused and the pause outlived its reason.
3. Review queue backlog (pipeline fine, humans behind).
4. Genuine pipeline failure (ledger shows `fail`; read its error).
5. Data predating the pipelines (legacy rows with old/null `last_checked_at` — DS-001…DS-007 territory; fix is admin re-verification, not cron).

## Recovery options
- Jobs not running ⇒ CRON-FAILURE-RECOVERY, then MANUAL-PIPELINE-REPLAY for the missed windows.
- Backlogged queue ⇒ work the queue (bulk actions exist, capped at 200/batch); nothing infrastructural.
- Legacy rows ⇒ admin re-verify offer-by-offer; never mass-update `last_checked_at` without actually checking (that would forge freshness — the one unforgivable fix).

## Requires approval
- Any bulk data correction (and it must go through admin surfaces/RPCs, never direct SQL — the 2026-07-19 stale-offer date corrections via un-audited SQL are recorded as a debt, not a precedent).

## Never casually
- Stamping verification timestamps without verifying.
- Un-pausing a compliance-paused source to "freshen" data.

## Validation after recovery
Freshness labels recover on next render (+ISR window); `/api/health/data` back to 200; ledger green in the next scheduled window.

## Escalation
Data operator: (fill in). Compliance owner for pause questions: (fill in).
