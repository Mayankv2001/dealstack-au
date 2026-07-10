# PLAN-monitor-health-endpoint - Turn silent monitor stalls into alerts

> **Status: Shipped in the 2026-07-10 production-readiness audit.**

> **Rank: 4 of 5.** Revalidated against `main` at `f65c951`. Monitor staleness
> is computed only while an admin is looking at `/admin/dashboard`; there is no
> machine-readable endpoint that an uptime service can poll. A dead Vercel cron,
> invalid secret, blocked feed, or disconnected external scheduler can therefore
> starve the queue and offer detection without notifying the owner. The admin
> emergency stop now exists, so observability is the remaining monitor-control
> gap.

## Goal

Add a secret-gated, read-only `GET /api/health/monitor` endpoint suitable for a
cron-job.org/UptimeRobot-style failure alert. It must make no external request
and no write. It returns non-2xx when monitoring is configured to run but has
never succeeded, is older than the existing 30-hour threshold, is blocked by a
missing compliance approval, or cannot read its own state.

Deliberately disabled/paused monitoring is healthy and must not page:

| State after valid authentication | Status/body contract |
|---|---|
| `OZB_MONITOR_ENABLED` is not exactly `true` | `200`, `{ ok: true, monitoring: "off" }` |
| Env enabled but compliance is not approved | `503`, `{ ok: false, reason: "compliance" }` |
| Env enabled, approved, zero enabled fetch-approved sources | `200`, `{ ok: true, monitoring: "paused" }` |
| Expected, successful run younger than 30h | `200`, `{ ok: true, monitoring: "on", lastSuccessAt }` |
| Expected, never succeeded or at least 30h old | `503`, `{ ok: false, reason: "stale", stale: true, lastSuccessAt, thresholdHours: 30 }` |
| State read fails | `503`, fixed public error text; detailed error only in server logs |

Before authentication: missing `CRON_SECRET` returns 503; missing/wrong bearer
returns 401. Reuse `CRON_SECRET` because the documented external scheduler
already possesses it; do not introduce another secret store in this phase.

## Exact Files To Touch

| File | Required change |
|---|---|
| `lib/monitor/health.ts` | New pure health-state derivation and response-safe types |
| `lib/admin/repos/monitorStatus.ts` | Add a lean read for compliance, enabled fetch-approved sources, and last successful run |
| `app/api/health/monitor/route.ts` | New authenticated, no-store route |
| `tests/monitor/health.test.ts` | Pure state-matrix and boundary tests |
| `tests/monitor/healthRoute.test.ts` | Route authentication/error/serialization tests with mocked DB read |
| `scripts/smoke-routes.ts` | Assert unauthenticated health access never returns 200 |
| `docs/ozbargain-monitoring.md` | Add endpoint contract and external alert-job setup |
| `docs/production-readiness.md` | Add health-alert setup and incident interpretation |
| `FINAL-LAUNCH-CHECKLIST.md` | Add manual alert-delivery verification |
| `.env.example` | Clarify that the health route uses `CRON_SECRET` |
| `PROJECT_STATE.md` | Record monitor alerting and remove the stale “alerts pending” claim |

Do not edit `vercel.json`: the Hobby plan's one daily cron is already used. Do
not add the health endpoint as a Vercel cron target.

## Implementation Order

1. Create `lib/monitor/health.ts` with no DB/env/Next imports:

   ```ts
   export interface MonitorHealthInput {
     envEnabled: boolean;
     complianceApproved: boolean;
     fetchableEnabledFeedCount: number;
     lastSuccessAt: string | null;
     now: Date;
   }

   export type MonitorHealth =
     | { ok: true; monitoring: "off" | "paused" }
     | { ok: true; monitoring: "on"; lastSuccessAt: string }
     | { ok: false; reason: "compliance" }
     | { ok: false; reason: "stale"; stale: true; lastSuccessAt: string | null; thresholdHours: number };

   export function deriveMonitorHealth(input: MonitorHealthInput): MonitorHealth
   ```

   Delegate stale math to `isMonitorStale()` and
   `MONITOR_STALE_HOURS` in `lib/monitor/staleness.ts`. Gate order is env off,
   compliance, fetchable count, stale/fresh. Do not duplicate time arithmetic.

2. Add a lean snapshot reader in `lib/admin/repos/monitorStatus.ts`, separate
   from the full admin dashboard snapshot. It needs only three concurrent reads:

   - whether any approved compliance review exists;
   - enabled `feed_sources.source_type` values (then count only
     `isApprovedForFetch` types, or filter approved types in the query);
   - newest `feed_fetch_log.started_at` whose `error is null`.

   Return `{ envEnabled, complianceApproved, fetchableEnabledFeedCount,
   lastSuccessAt }`. Do not call `getMonitorStatus()` from the health route: it
   performs many unrelated counts and content queries every time an external
   checker polls.

3. Create the route with:

   ```ts
   export const dynamic = "force-dynamic";
   export const runtime = "nodejs";
   ```

   Copy the existing cron route's constant-time Bearer comparison exactly. A
   shared extraction would alter the production cron gate; keep the small
   duplication in this phase and note it in both functions.

4. Route execution order must be:

   - read `cronSecret()`; absent -> 503 before DB work;
   - authenticate `Authorization: Bearer ...`; failure -> 401 before DB work;
   - call the lean snapshot reader inside `try/catch`;
   - call `deriveMonitorHealth({ ...snapshot, now: new Date() })`;
   - serialize healthy states as 200 and unhealthy states as 503;
   - attach `Cache-Control: no-store` to every response;
   - on DB error, `console.error` a stable prefix and return only
     `{ ok: false, error: "Health check failed." }`.

5. Add pure tests at exact boundaries:

   - env off is healthy even with no success;
   - env on + compliance false is unhealthy;
   - approved + zero fetchable sources is paused/healthy (emergency stop);
   - 29h59m59s is fresh;
   - exactly 30h is stale (matches current `age < threshold` contract);
   - null and malformed success timestamps are stale when runs are expected;
   - future timestamp is treated fresh, matching existing staleness semantics.

6. Add route tests using the pattern in `tests/monitor/cronRoute.test.ts`:

   - secret unset -> 503 and snapshot reader not called;
   - missing/wrong token -> 401 and no DB call;
   - each health variant maps to the correct status/body;
   - snapshot throw -> generic 503 body that does not contain the thrown text;
   - all responses include `Cache-Control: no-store`;
   - response JSON never includes feed labels, URLs, item titles, or env values.

7. Extend `scripts/smoke-routes.ts` with an unauthenticated GET. Accept 503 when
   the local secret is absent and 401 when production has it; fail if it returns
   200, redirects to login, or leaks a stack trace.

8. Document a second external scheduler job, separate from the monitor trigger:

   - URL: `https://<production>/api/health/monitor`;
   - method GET;
   - same Bearer header;
   - every 3 hours at a different minute from the monitor trigger;
   - notify on non-2xx and timeout;
   - test delivery once with a deliberately wrong bearer, then restore it.

   Explain 200 `paused` after the emergency stop versus 503 `stale` while
   monitoring is expected.

9. Run the full Node 20 gate:

   ```bash
   npm run lint
   npm run test:monitor
   npm run test:stack
   npm run test:admin
   npm run build
   npm run smoke
   git diff --check
   ```

## Edge Cases A Weaker Model Would Miss

1. **Authentication precedes service-role reads.** An unauthenticated health
   probe must cost no Supabase queries and reveal no operational state.
2. **No enabled fetch-approved feed means paused, not stale.** Registry-only
   source types (`manual-url`, `pointhacks`, etc.) are never fetched and must not
   make health expect a run.
3. **Compliance differs from intentional off.** Env on with no approval is an
   unsafe/misconfigured state already highlighted in admin; returning 200 would
   hide it from the alerting path.
4. **Use last successful run, not latest run.** A recent failed fetch must not
   make the monitor look fresh.
5. **Do not call the full status aggregator.** It currently performs numerous
   counts and list reads intended for a human dashboard. Polling that every few
   hours is unnecessary load and broadens the failure surface.
6. **The endpoint observes; it never heals.** No enabling/disabling, fetch,
   detection, retry, or candidate write belongs in this route.
7. **Do not add a second Vercel cron.** External monitoring is the only option
   compatible with the documented Hobby-plan limit.
8. **A missing secret is unhealthy.** Returning "off" would make a blind health
   check report green.
9. **Generic DB errors only.** Supabase messages can expose table names and
   implementation details; keep them in Vercel logs.
10. **No caching.** ISR/CDN caching can preserve an old healthy response during
    an outage; force dynamic and `no-store` are both required.
11. **Timeout alerts are meaningful.** A hanging Supabase read is itself an
    inability to establish health, so the external checker should notify.
12. **The endpoint is not detection health.** Detection runs after ingestion and
    has its own admin status. Keep this contract to expected feed success.

## Acceptance Criteria

- [ ] Auth/status matrix matches the table above, including exact 30-hour
      boundary and intentional `paused` state after emergency disable.
- [ ] Unauthenticated requests perform no DB reads and never return 200.
- [ ] Route imports neither `fetchFeed` nor `runMonitor` and contains no DB
      mutation calls.
- [ ] External response contains only booleans, state labels, threshold, and the
      last success timestamp; no feed/content/error internals.
- [ ] Ordinary smoke includes the unauthenticated gate check.
- [ ] `vercel.json` and the existing cron route have no diff.
- [ ] External alert job is documented and a forced failure notification is
      manually verified.
- [ ] Full Node 20 quality gate and `git diff --check` pass.
