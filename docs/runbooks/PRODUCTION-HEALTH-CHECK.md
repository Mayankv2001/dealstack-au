# Runbook — Production health check

A repeatable, read-only walk to answer "is DealStack AU healthy right now?" in ~10 minutes.

## Health surfaces and how to read them

| Surface | How | Healthy looks like |
|---|---|---|
| `/api/health/monitor` (bearer `CRON_SECRET`) | curl with bearer; `no-store` | 200. Off/paused states return 200 with the reason (intentional pause ≠ failure); 503 = pipeline stalled while enabled (staleness > 30h, `lib/monitor/staleness.ts`) or config error |
| `/api/health/data` (bearer) | curl with bearer | 200. 503 lists overdue reviews — that is a *work queue* signal, not an outage |
| GitHub Actions | repo → Actions | All scheduled workflows green in their last window. Exit 2 = Actions `CRON_SECRET` secret missing (nothing was sent). "Scheduled workflows disabled" banner = ~60-day inactivity auto-disable |
| `/admin/monitor` + gift-card job-run pages | logged-in admin | Ledger rows present for each enabled job's last window, status `ok` (or honest `skipped` reasons) |
| Public spot-check | browser, read-only | See below |
| Vercel dashboard | project → Deployments/Crons | Latest deploy healthy; both daily crons fired |

## Public spot-check (read-only, 3 minutes)

1. `/` — hero renders; gift-card carousel populated; featured stack shows verified-vs-total split and pay-now/cashback-later separation.
2. `/deals` — list populated; no deal shows an expiry date before today (Sydney); freshness badges present.
3. `/gift-cards` — offer count matches expectation (13 published as of 2026-07-19); no "sample"/placeholder prose.
4. `/search?q=myer&spend=500` — plan renders with citations.
5. Any offer detail — source link present, `lastCheckedAt`-style freshness visible, conditions rendered.

**Demo-fallback tell:** if production ever shows the static sample dataset while Supabase is configured, that is a P0 incident — the repo contract (`lib/repos/index.ts`) is "configured empty stays empty", so demo content appearing means env/config breakage. Verify which mode you're seeing before judging data quality.

## Interpreting combinations

- Actions red (exit 2) + ledgers empty ⇒ secret missing; CRON-FAILURE-RECOVERY.
- Actions green + ledger `skipped: environment-disabled` ⇒ intentional pause; confirm it's on the ops log (EMERGENCY-SOURCE-PAUSE), else escalate.
- health/monitor 503 + last run recent-and-ok ⇒ staleness math vs clock issue — rare; capture the JSON body before touching anything.
- health/data 503 ⇒ list the overdue reviews; route to the admin review queues, not to infrastructure.
- Public page stale but ledgers green ⇒ ISR cache window (300s) or revalidation miss; recheck after 5 minutes before escalating.

## Requires approval
Nothing in this runbook mutates anything; it is safe to run entirely. Anything you'd do *about* a finding lives in the linked runbooks and their approval sections.

## Never casually
- Do not "test" cron endpoints with `?force=1` as part of health checking — that's a replay (MANUAL-PIPELINE-REPLAY).
- Do not log in to Supabase and run ad-hoc SQL as a health check; the health endpoints exist so you don't have to.

## Validation / cadence
Run after every deploy, after any incident recovery, and when the monitor-health workflow (3-hourly) goes red. Record the result (date, operator, anomalies) in the ops log.

## Escalation
On-call/owner: (fill in). Vercel + Supabase status pages for platform-side suspicion.
