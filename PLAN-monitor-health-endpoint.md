# PLAN-monitor-health-endpoint — An alert the owner doesn't have to go looking for

> **Rank: 3 of 5 (2026-07-10 follow-on backlog).** The feed monitor's
> staleness detection exists (`lib/monitor/staleness.ts`, 30h threshold) but
> it only renders as a banner on `/admin/dashboard` and `/admin/monitor` —
> pull-based alerting: if the owner doesn't visit admin, a dead pipeline
> (expired CRON_SECRET, disabled Vercel cron, OzBargain blocking the UA,
> external scheduler silently unsubscribed) goes unnoticed until the queue
> runs dry. `docs/ozbargain-monitoring.md` itself lists this as an open gap:
> item 8 "Observability + **alerts** + admin kill-switch toggle" is marked
> `[~]` Partial with "**alerts + toggle still pending**" (:328-332). The
> infrastructure for push alerting is already in place for free: the
> external scheduler (cron-job.org) that GETs the monitor route every ≤3h —
> the doc even has a "cron-job.org setup (manual steps)" section (:620) —
> supports failure notifications on non-2xx responses. This plan adds one
> secret-gated, read-only route — `GET /api/health/monitor` — that returns
> 200 while the monitor is fresh (or intentionally off) and **503 when runs
> are expected but stale**, so a second cron-job.org job emails the owner
> within hours of a stall. No new Vercel cron (Hobby limit untouched), no
> writes, no data exposure. With detection about to go live
> (PROJECT_STATE §6.1), a silently-stalled monitor would also silently
> starve detection — this closes that hole too.

## Prerequisites

- `git pull --rebase`; clean tree; `nvm use 20`; read `AGENTS.md` (route
  handlers are the one Next.js 16 surface here — copy conventions from the
  existing cron route, not from memory).
- Read fully before coding:
  - `app/api/cron/monitor-feeds/route.ts` — the auth/gate pattern you
    mirror (`isAuthorized` with `timingSafeEqual`, 503-when-no-secret,
    `dynamic = "force-dynamic"`, `runtime = "nodejs"`). **You will NOT edit
    this file** (edge case 1).
  - `lib/monitor/staleness.ts` — `isMonitorStale` + `MONITOR_STALE_HOURS`;
    note the semantics: zero fetchable feeds → not stale; null/unparseable
    lastSuccess → stale.
  - `app/admin/(protected)/dashboard/page.tsx:159-172` — the ONE existing
    staleness computation; your route must reproduce its inputs exactly
    (`fetchableEnabledFeedCount` from `listFeedSources` +
    `isApprovedForFetch(sourceType)`, `lastSuccessAt` from
    `monitor.lastSuccessLog?.startedAt`, gated on `monitor.envEnabled`).
  - `lib/admin/repos/monitorStatus.ts` — `getMonitorStatus()` (whose
    fields you reuse) and `lib/admin/repos/feedSources.ts` for
    `listFeedSources` / `isApprovedForFetch`.
  - `tests/monitor/cronRoute.test.ts` — the offline route-testing pattern
    (vi.hoisted mocks, `vi.stubEnv`, direct `GET(request)` calls) your new
    test file copies.
  - `scripts/smoke-routes.ts` — the check runner, for Step 4.

## Goal

`GET /api/health/monitor` with `Authorization: Bearer $CRON_SECRET`:

| State | Response |
|---|---|
| `CRON_SECRET` unset | **503** `{ ok: false, error: "CRON_SECRET is not configured." }` |
| Bad/missing bearer | **401** `{ ok: false, error: "Unauthorized." }` |
| Monitoring not expected (env switch off, OR compliance not approved, OR zero enabled fetchable feeds) | **200** `{ ok: true, monitoring: "off" }` |
| Expected + last success within 30h | **200** `{ ok: true, monitoring: "on", lastSuccessAt }` |
| Expected + stale (or never succeeded) | **503** `{ ok: false, stale: true, lastSuccessAt, thresholdHours: 30 }` |
| Any DB read failure | **503** `{ ok: false, error: "Health check failed." }` (detail to console.error only) |

A cron-job.org job polling this URL every 3h with failure notifications
enabled becomes the owner's pager. The route never fetches feeds, never
writes, and returns booleans/counts/timestamps only.

## Exact files to touch

| File | Change |
|---|---|
| `app/api/health/monitor/route.ts` | **New** — the whole feature |
| `tests/monitor/healthRoute.test.ts` | **New** — offline gate/matrix tests |
| `scripts/smoke-routes.ts` | One added check: unauthenticated GET must NOT return 200 |
| `docs/ozbargain-monitoring.md` | Extend the existing "cron-job.org setup (manual steps)" section (:620) with the second (health-alert) job; tick/annotate the item-8 "alerts" gap (:328-332) |
| `FINAL-LAUNCH-CHECKLIST.md` | §12 bullet: configure the health-check job + notifications |
| `PROJECT_STATE.md` | §4/§11 entries |

**Not touched:** `app/api/cron/monitor-feeds/route.ts`, `vercel.json`,
`lib/monitor/staleness.ts`, RLS/migrations.

## Step-by-step implementation order

### Step 1 — the route

`app/api/health/monitor/route.ts`, in this order:

1. `export const dynamic = "force-dynamic"; export const runtime = "nodejs";`
2. Copy `isAuthorized` (the `timingSafeEqual` Bearer check) **verbatim**
   from the cron route into this file, with a comment saying it is
   deliberately duplicated because the cron route is under the
   do-not-touch monitor-gate rule.
3. `GET(request)`:
   - Secret unset → 503 (same body text as the cron route's).
   - `isAuthorized` fails → 401. **Auth precedes every DB read** so
     unauthenticated probes cost nothing.
   - Load `const [status, feedSources] = await Promise.all([getMonitorStatus(), listFeedSources()])`
     inside a try/catch → catch returns the 503 "Health check failed."
     (generic body; `console.error` the real message).
   - `const fetchable = feedSources.filter((s) => s.isEnabled && isApprovedForFetch(s.sourceType)).length;`
   - `const expected = status.envEnabled && status.complianceApproved && fetchable > 0;`
     if not expected → 200 `{ ok: true, monitoring: "off" }`.
   - `const stale = isMonitorStale({ fetchableEnabledFeedCount: fetchable, lastSuccessAt: status.lastSuccessLog?.startedAt ?? null, now: new Date() });`
   - stale → 503 `{ ok: false, stale: true, lastSuccessAt, thresholdHours: MONITOR_STALE_HOURS }`;
     fresh → 200 `{ ok: true, monitoring: "on", lastSuccessAt }`.

### Step 2 — tests (`tests/monitor/healthRoute.test.ts`)

Copy the cronRoute.test.ts scaffolding: `vi.hoisted` mocks for
`@/lib/admin/repos/monitorStatus` (`getMonitorStatus`) and
`@/lib/admin/repos/feedSources` (`listFeedSources`, `isApprovedForFetch`),
`vi.stubEnv("CRON_SECRET", …)`, `afterEach(vi.unstubAllEnvs)`. Cases —
one per matrix row above, plus:

- never-succeeded (`lastSuccessLog: null`) while expected → 503 stale.
- unparseable `startedAt` ("not-a-date") → 503 stale (NaN-safety comes
  from `isMonitorStale`; the test pins the wiring).
- compliance approved but env switch off → 200 "off" (not stale — a
  deliberately disabled monitor is not an incident, same rule as the
  dashboard comment).
- DB read throws → 503 with the generic error body, and the response text
  must NOT contain the thrown message.

### Step 3 — smoke check

In `scripts/smoke-routes.ts`, add one check alongside the route checks:
`GET /api/health/monitor` **without** auth must return 401 or 503 — fail
the check if it returns 200 (that would mean the gate is open). Accept
both codes: locally CRON_SECRET is usually unset (503); in prod it is set
(401).

### Step 4 — docs

- `docs/ozbargain-monitoring.md`: in the existing "cron-job.org setup
  (manual steps)" section (:620), add the second job — same URL base +
  `/api/health/monitor`, same `Authorization: Bearer` header as the
  monitor job, schedule every 3h, enable failure notifications (non-2xx
  and timeout both notify); include the curl matrix for manual
  verification. Update the item-8 status line (:328-332): alerts now
  covered; only the admin kill-switch toggle remains pending.
- `FINAL-LAUNCH-CHECKLIST.md` §12: one bullet pointing at that section.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:monitor && npm run test:admin && npm run test:stack
npm run smoke   # includes the new check, against local `npm run start`
```

Manual curl matrix against `npm run dev` with `CRON_SECRET=test` in
`.env.local`: no header → 401; wrong bearer → 401; correct bearer → 200
`monitoring:"off"` (local has no enabled feeds/compliance). Then unset
CRON_SECRET → 503.

## Edge cases a weaker model would miss

1. **Do not extract a shared auth helper into the cron route.** The obvious
   refactor (move `isAuthorized` to `lib/` and import it in both routes)
   edits `app/api/cron/monitor-feeds/route.ts` — protected by the
   "do not change monitor gate logic" rule. Duplicate the 8-line function
   and say why in a comment. Two copies of a constant-time compare beat one
   edit to the production gate.
2. **"Monitor intentionally off" must be healthy.** If env switch off /
   compliance unapproved / no enabled fetchable feeds returned 503, the
   owner would get alert spam for a state they chose, then disable the
   alert job, then miss a real stall later. The `expected` gate mirrors the
   dashboard's exact logic (its comment: "a deliberately disabled monitor
   is not an incident").
3. **503-when-secret-unset is deliberate, matching the cron route.** A
   misconfigured deployment should page (the alert job sees 503) rather
   than report healthy. Do not return 200 "off" for a missing secret.
4. **`fetchable` counts enabled feeds whose `sourceType` passes
   `isApprovedForFetch`** — not all enabled feeds. A `manual-url` source
   never gets fetched (`listDueEnabledFeeds` skips it — launch checklist
   §4), so counting it would make the route expect runs that can never
   happen and alert forever. Copy the dashboard's filter, not
   `status.feedSourcesEnabled`.
5. **Use `lastSuccessLog?.startedAt ?? null`, exactly like the dashboard.**
   `lastSuccessLog` is the most recent ok/not-modified run;
   `recentFetchLog[0]` would count *failed* runs as freshness and mask a
   stall where every run errors.
6. **No query params, no threshold override, no verbose mode.** Every knob
   is attack/abuse surface on a route that (behind auth) reads with the
   service role. `MONITOR_STALE_HOURS` is imported, not configurable per
   request.
7. **Response bodies leak nothing:** no feed URLs, labels, item titles, or
   error internals. The DB-failure branch returns a fixed string — the
   thrown message goes to `console.error` (Vercel logs) only. The tests pin
   this.
8. **robots.txt already disallows `/api`** (`app/robots.ts`) — no change
   needed there; don't add one.
9. **Security headers apply globally via `next.config.ts`** — don't re-add
   them per-route.
10. **cron-job.org quirk worth a docs sentence:** its "failure" trigger
    fires on timeouts too. The route does two cheap head-count/select
    queries and returns; if the owner ever sees timeout alerts with a
    healthy monitor, the docs should say to check Supabase latency before
    suspecting the feed pipeline.
11. **Placement is `app/api/health/monitor/route.ts`**, NOT under
    `app/api/cron/` — it is not a cron target and must never be added to
    `vercel.json` (Hobby allows exactly one cron and it is taken).
12. **This route reports on the monitor, not on detection.** The detection
    ops card on `/admin/monitor` (shipped `d499d7e`) covers detection
    visibility; don't fold candidate counts into this response — keep the
    health contract to one binary question ("are expected fetches
    happening?") so the alert never cries wolf about a different subsystem.

## Acceptance criteria

- [ ] Full curl matrix behaves per the table (verified locally with and
      without `CRON_SECRET`, right/wrong/missing bearer).
- [ ] `tests/monitor/healthRoute.test.ts` covers all matrix rows + the four
      extra cases in Step 2; `npm run test:monitor` green.
- [ ] Route file contains no `insert`/`update`/`upsert`/`delete` calls and
      imports neither `fetchFeed` nor `runMonitor`
      (`grep -nE "insert|update|upsert|delete|fetchFeed|runMonitor" app/api/health/monitor/route.ts` → 0 hits).
- [ ] Unauthenticated smoke check added and green; full smoke run passes.
- [ ] `vercel.json` diff is empty; cron route file diff is empty.
- [ ] Docs updated (cron-job.org section extended; item-8 gap annotated;
      launch checklist §12 bullet).
- [ ] `npm run lint`, `npm run build`, all three test suites green on
      Node 20.
- [ ] Human follow-up documented (not blocking): second cron-job.org job
      created with notifications on; a forced test (temporarily wrong
      bearer in the job) produces one alert email, then is corrected.
