> **STATUS (2026-07-10): SHIPPED in `53c4a50` — do not re-execute.**
> Kept for reference. Verify with `git log --oneline | grep 53c4a50`.

# PLAN: Feed ingestion recovery — the monitor has silently fetched nothing since 2026-07-01

> **Rank: 6 of 10 — do this FIRST of the second tranche. Production is broken
> today.**
> Commit `4bdf0c9` (2026-07-02) correctly hardened `listDueEnabledFeeds`
> (`lib/admin/repos/feedSources.ts:237`) to only select feeds whose
> `source_type` is in `APPROVED_FEED_SOURCE_TYPES` (currently just
> `'ozbargain'`). But both enabled OzBargain feeds in prod still carry the
> pre-migration backfill default `source_type='manual-url'` (verified by SQL
> 2026-07-08; their `last_fetched_at` values are 2026-06-30 and 2026-07-01 —
> nothing since). So every cron / external-scheduler run since then selects
> **zero feeds** and exits "successfully". Nothing alerts on this. This plan
> fixes the data (ops step via admin UI), then adds the two guardrails that
> would have caught it: an "enabled but not fetchable" warning in the admin,
> and a monitor-staleness row in the dashboard's Needs attention list.

## Prerequisites

- Plans 1–5 (`PLAN-cards-go-live.md` … `PLAN-generated-db-types.md`) are
  complete. In particular the dashboard already gained card-offer rows
  (plan 1) — clone the freshest patterns you find, not the pre-plan-1 code.
- `nvm use 20` before any `npm run lint / build / test:*`.
- Read `AGENTS.md` (Next.js 16 — check `node_modules/next/dist/docs/` before
  editing `app/` files).
- Read before editing: `lib/admin/repos/feedSources.ts` (whole file, esp.
  `listDueEnabledFeeds` and the `isApprovedForFetch` re-export),
  `lib/monitor/offerChanges.ts:46-90` (source-type registry + approval gate),
  `lib/admin/repos/monitorStatus.ts` (`getMonitorStatus`, `lastSuccessLog`),
  `app/admin/(protected)/signals/sources/page.tsx`,
  `components/admin/FeedSourceForm.tsx`,
  `app/admin/(protected)/dashboard/page.tsx` (the `attention` array),
  `lib/env.ts` (monitor env accessors).

## Goal

1. (Ops) The two real OzBargain feeds are reclassified to
   `source_type='ozbargain'` through the admin UI, and fetching demonstrably
   resumes.
2. (Code) The sources admin page visibly warns when a feed is enabled but its
   source type is not fetch-approved.
3. (Code) The admin dashboard "Needs attention" list flags when the monitor
   has enabled+fetchable feeds but no successful fetch run within a threshold.

**Explicitly NOT the fix:** do not widen `APPROVED_FEED_SOURCE_TYPES`, and do
not remove or weaken the `.in("source_type", …)` filter in
`listDueEnabledFeeds`. That enforcement is a deliberate Phase-1 safety fix
and it is behaving correctly — the *data* was misclassified. Any "fix" that
touches the gate logic is wrong and violates the monitor safety rule.

## Exact files to touch

| File | Change |
|---|---|
| `lib/monitor/staleness.ts` | **New** — pure `isMonitorStale()` helper |
| `app/admin/(protected)/signals/sources/page.tsx` | Warning banner + per-row "Not fetchable" badge |
| `components/admin/FeedSourceForm.tsx` | Hint text under the source-type select |
| `app/admin/(protected)/dashboard/page.tsx` | Two new Needs-attention rows |
| `tests/monitor/staleness.test.ts` | **New** — pure tests |

No migrations. No changes to `lib/monitor/runMonitor.ts`,
`lib/monitor/fetchFeed.ts`, `app/api/cron/monitor-feeds/route.ts`, or
`vercel.json`.

## Step-by-step implementation order

### Step 1 — ops: reclassify the two real feeds (human-approved data change)

In `/admin/signals/sources`, edit ONLY these two (they are the real feeds;
the other two rows are labelled `[EXAMPLE — DISABLED]` and must stay
`manual-url` and disabled):
- "OzBargain — Costco Wholesale deals"
- "OzBargain deals feed test"

Set **Source type** to `ozbargain` and save. The form already has the select
(`components/admin/FeedSourceForm.tsx`, `name="source_type"`) and
`updateFeedSource` already persists it — no code needed for this step.

Verify recovery: locally run `nvm use 20 && npm run monitor:feeds -- --dry-run`
(reads `.env.local`; dry-run fetches nothing but shows which feeds are now
DUE/selected). Then after the next external-scheduler window, re-check
`feed_sources.last_fetched_at` advances and `/admin/monitor → Recent fetch
runs` shows a new `ok` row. Do NOT trigger extra fetches yourself beyond the
dry-run; the 12h per-feed floor and scheduler handle cadence.

### Step 2 — `lib/monitor/staleness.ts` (pure, testable)

```ts
/**
 * Monitor staleness check — pure. The monitor is "stale" when we EXPECT runs
 * (at least one enabled, fetch-approved feed) but the last successful fetch
 * is older than the threshold. With a daily Vercel cron plus an optional
 * 3-hourly external scheduler, 30h tolerates one missed daily run without
 * flapping. No successful run ever (null) counts as stale when feeds expect
 * fetching.
 */
export const MONITOR_STALE_HOURS = 30;

export function isMonitorStale(opts: {
  fetchableEnabledFeedCount: number;
  lastSuccessAt: string | null; // ISO timestamp of last status='ok' fetch log
  now: Date;
  thresholdHours?: number;
}): boolean {
  if (opts.fetchableEnabledFeedCount === 0) return false;
  const threshold = (opts.thresholdHours ?? MONITOR_STALE_HOURS) * 3_600_000;
  if (opts.lastSuccessAt == null) return true;
  const age = opts.now.getTime() - Date.parse(opts.lastSuccessAt);
  return !(age < threshold); // NaN-safe: unparseable timestamp counts as stale
}
```

### Step 3 — sources page warning

In `app/admin/(protected)/signals/sources/page.tsx`:
1. Import `isApprovedForFetch` (already re-exported from
   `lib/admin/repos/feedSources.ts:39`).
2. Compute `const enabledUnfetchable = sources.filter((s) => s.isEnabled && !isApprovedForFetch(s.sourceType));`
3. When non-empty, render an amber banner styled like the existing
   `enabledWithoutApproval` compliance warning already on this page (clone
   its markup/tone): "N enabled feed(s) have a source type the monitor will
   never fetch (only `ozbargain` is fetch-approved). Edit the feed and set
   its source type, or disable it."
4. In the table row where `SOURCE_TYPE_LABELS[source.sourceType]` renders,
   append a small destructive/amber `Badge` reading "Not fetchable" when
   `source.isEnabled && !isApprovedForFetch(source.sourceType)`.

### Step 4 — form hint

In `components/admin/FeedSourceForm.tsx`, under the source-type select, add a
muted `<p>` hint: "Only `ozbargain` sources are fetched by the monitor.
Other types are registry-only entries and will never be polled." (Keep the
default `manual-url` — safe-by-default for new entries is intentional.)

### Step 5 — dashboard Needs-attention rows

In `app/admin/(protected)/dashboard/page.tsx`:
1. Import `getMonitorStatus` from `lib/admin/repos/monitorStatus` and
   `isMonitorStale` / `MONITOR_STALE_HOURS` from `lib/monitor/staleness`, and
   `isApprovedForFetch` from `lib/admin/repos/feedSources`.
2. Add `getMonitorStatus()` to the page's existing `Promise.all` (keep
   destructure order aligned — it's positional).
3. Derive from the returned `MonitorStatus` (read its interface first — it
   already carries the enabled-source list/counts and `lastSuccessLog`; use
   the fields that exist rather than inventing new queries; if the fetchable
   count is not directly available, compute it from the sources data the
   status already includes, or fall back to a small
   `feed_sources` count via the existing repo — do NOT duplicate
   `getMonitorStatus` logic):
   - `fetchableEnabledFeedCount`
   - `lastSuccessAt` (the `lastSuccessLog`'s timestamp field, or null)
4. Append two rows to the `attention` array:
   ```ts
   {
     label: `Feed monitor: no successful run in ${MONITOR_STALE_HOURS}h+`,
     value: monitorStale ? 1 : 0,
     href: "/admin/monitor",
   },
   {
     label: "Enabled feeds the monitor cannot fetch",
     value: enabledUnfetchableCount,
     href: "/admin/signals/sources",
   },
   ```
   The `attention` rows are `{label, value: number, href}` and render a badge
   with the count — `0` renders muted, which is the desired all-clear state.
5. Suppression rule: when `OZB_MONITOR_ENABLED` is not `"true"` (read it the
   same way the cron route / env accessor does — check `lib/env.ts` for an
   existing accessor before touching `process.env` directly), force the
   staleness row's value to 0. A deliberately disabled monitor is not an
   incident.

### Step 6 — tests: `tests/monitor/staleness.test.ts`

Pure tests (suite: `npm run test:monitor`), always with injected `now`:
zero fetchable feeds → never stale (even with null lastSuccess); null
lastSuccess + feeds present → stale; 29h old → not stale; 31h old → stale;
exactly threshold → stale (document the boundary you implement); unparseable
timestamp → stale; custom threshold honoured.

### Step 7 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:monitor && npm run test:stack && npm run test:admin
```

Dev check (`npm run dev`, reads prod): before Step 1's reclassification the
dashboard should show the staleness row ≥1 and "Enabled feeds the monitor
cannot fetch: 2"; after reclassification + the next successful scheduler run,
both drop to 0.

## Edge cases a weaker model would miss

1. **The tempting fix is the forbidden one.** Adding `'manual-url'` to
   `APPROVED_FEED_SOURCE_TYPES` (or dropping the filter) makes the symptom
   vanish and reopens the exact hole `4bdf0c9` closed — `manual-url` is the
   catch-all backfill type with no verified feed contract. The data change
   (Step 1) is the entire fix to ingestion.
2. **Two of the four feed rows are decoys.** The `[EXAMPLE — DISABLED]` rows
   must remain `manual-url` + disabled. Reclassifying them to `ozbargain`
   would make them fetchable if anyone ever enables them.
3. **Staleness must be conditional on expectation.** If all feeds are
   disabled (emergency-stop Option B in the runbook) or none are
   fetch-approved, "no recent success" is the *intended* state — alerting on
   it trains the admin to ignore the row. Hence
   `fetchableEnabledFeedCount === 0 → never stale`, and the env-disabled
   suppression in Step 5.
4. **`Date.parse` of a bad timestamp is `NaN`**, and `NaN < threshold` is
   false — write the comparison so NaN lands on the *stale* side (see the
   `!(age < threshold)` form) and pin it with a test.
5. **Don't compute staleness inside `getMonitorStatus`** with `new Date()`
   buried in the repo — keep the pure helper taking `now` so it's testable
   and so the dashboard stays the only place that decides thresholds.
6. **`getMonitorStatus` is several queries**; it's acceptable on the admin
   dashboard, but add it to the existing `Promise.all`, not as a serial
   await after it.
7. **After ingestion resumes, the queue refills.** Plan 3's 200-item cap and
   banner handle the render; expect "Feed items to review" to climb again —
   that is recovery working, not a regression.
8. **Positional destructuring** of the dashboard `Promise.all` (same trap as
   plan 1): keep array order and destructure order in lockstep.

## Acceptance criteria

- [ ] Prod: both real OzBargain feeds show `source_type='ozbargain'`
      (`select id, source_type from feed_sources where is_enabled`), the two
      example rows unchanged; `npm run monitor:feeds -- --dry-run` selects
      them; within a day, `last_fetched_at` advances and `/admin/monitor`
      shows a fresh `ok` run.
- [ ] `git diff` shows NO change to `APPROVED_FEED_SOURCE_TYPES`,
      `listDueEnabledFeeds`'s filters, `runMonitor.ts`, the cron route, or
      `vercel.json`.
- [ ] Sources page: enabled + non-approved feed renders the banner and a
      per-row "Not fetchable" badge; approved or disabled feeds don't.
- [ ] Dashboard: the two new attention rows render; staleness row is 0 when
      the monitor is env-disabled or no fetchable feeds exist; both rows are
      0 after recovery.
- [ ] `npm run test:monitor` passes including the new staleness tests
      (boundary + NaN cases present); lint/build/all suites green (Node 20).
