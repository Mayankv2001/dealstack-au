# Automated deal pipeline status

This document is the implementation record for the 2026-07-11 master plan.
The code path deliberately extends the existing authenticated
`/api/cron/monitor-feeds` route instead of adding a second cron endpoint. That
keeps one scheduler, one lock and one run ledger. `vercel.json` invokes it daily
at `00:00 UTC`; optional external invocations use the same route and lock.

## Implemented

| Plan area | Current implementation |
|---|---|
| WIP/schema foundation | Migrations 015–017, direct transactional approval, fetch accounting, stale-run takeover and the disabled card-feed registry are committed. |
| Deal moderation | `/admin/review?tab=deals` provides search/filter/sort, editable metadata, single and bulk Approve/Reject, and reversible history. The old queue URL redirects. |
| Cleanup and retention | Migration 019 atomically expires published offers/signals, archives stale evergreen signals and overdue cards, retires 60-day queue items, and purges only 90-day rejected/ignored rows with audit records. |
| Pipeline | The existing cron route executes cleanup, live validation, feed fetch and optional detection under one run lock and records per-step counters/errors in `daily_pipeline_runs`. |
| Card assistance | Migration 018 adds private card candidates. Conservative issuer/card/value heuristics are separately gated by `CARD_DETECT_ENABLED`; resolved candidates require admin Apply and unresolved candidates create unpublished draft prefills. |
| Unified admin | Deals, offer changes and history are composed at `/admin/review`; monitor and audit pages expose run, retention, detection and system events. |
| Health and alerting | The secret-gated health route checks stale/stuck/failed pipelines, per-feed parser failures, auto-disabled feeds, per-feed count anomalies and duplicate starts. Failed health and partial/error runs use the optional alert webhook. |
| Audit | Fetch logs and the run ledger cover fetches; migration 019 transactionally audits cleanup, retention and candidate staging; admin mutations retain the request-actor trigger and explicit action audit. |

## Rollout boundary

Application code in this change must not deploy before migrations 018 and 019
are applied. After applying them:

1. Run `npm run verify:schema` with the production Supabase environment.
2. Deploy with `CARD_DETECT_ENABLED=false`; keep the registered card feed disabled.
3. Invoke the cron route once with its bearer secret and verify one completed
   `daily_pipeline_runs` row plus `/admin/monitor` counters.
4. Observe two successful daily runs before enabling additional feed sources.
5. Review detection previews on at least two days before enabling
   `OZB_OFFER_DETECT_ENABLED`; enable `CARD_DETECT_ENABLED` separately only after
   card precision is acceptable.

Rollback is code-first: disable detection/feed switches or promote the prior
deployment. Migrations are additive and should remain applied; do not run a
destructive down migration during an incident.

## Deliberate deviations from the original plan

- No Finder or issuer-site fetcher exists. Only approved RSS data is scanned.
- There is no second `/api/cron/daily-pipeline` route. The existing cron route is
  the pipeline entry point, avoiding two active scheduler contracts.
- Cleanup continues even when feed monitoring is disabled, so the feed emergency
  stop cannot suspend public-data hygiene.
- Manual signals can still use `pending`; feed-sourced approvals bypass that
  redundant state through the reviewed transactional RPC.
