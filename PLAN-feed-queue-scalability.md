# PLAN: Feed queue scalability — cap the unbounded query, chunk the lookup, burn the backlog

> **Rank: 3 of 5.**
> The admin feed queue currently has **295 items in `review_state='new'`**
> (prod, 2026-07-07) and grows every 3 hours via the external scheduler.
> `listNewFeedItems()` in `lib/admin/repos/feedQueue.ts` fetches **every**
> 'new' row with no limit, then feeds **all** their `source_native_id`s into
> a single PostgREST `.in()` filter. Both are unbounded: the page render gets
> slower every week, and the `.in()` querystring will eventually exceed URL
> limits and 500 the whole queue page. This plan caps the read, chunks the
> lookup, tells the admin the true backlog size, and includes the operational
> steps to shrink today's 295 with tools that already exist.

## Context you must load first

- Run `nvm use 20` before `npm run lint / build / test:*`.
- Read `AGENTS.md` (Next.js 16 — read `node_modules/next/dist/docs/` guides
  before editing `app/` files).
- Read before editing:
  - `lib/admin/repos/feedQueue.ts` (whole file)
  - `app/admin/(protected)/signals/queue/page.tsx`
  - `app/admin/(protected)/signals/queue/actions.ts` — note `BULK_IGNORE_MAX = 200`
    and that `ignoreVisibleItems` already exists (scoped bulk ignore)
  - `scripts/cleanup-old-deals.ts` — `ignoreStaleFeedItems` (already handles
    abandoned staged items)
- Safety rules that bind this plan: **no bulk import, no auto-import, no
  auto-publish**. Bulk *ignore* is the only permitted bulk operation and it
  already exists — do not add new bulk mutations.

## Goal

1. The queue page loads a bounded set (newest 200) no matter how large the
   backlog grows.
2. The existing-signal lookup can never exceed URL limits (chunked `.in()`).
3. The admin always sees the true total ("Showing newest 200 of 295") so a
   capped view is never mistaken for the whole queue.
4. Today's backlog gets an operational burn-down path using existing tools.

## Exact files to touch

| File | Change |
|---|---|
| `lib/admin/repos/feedQueue.ts` | `QUEUE_PAGE_LIMIT`, `.limit()` on the query, exported pure `chunk()`, chunked `.in()` lookup |
| `app/admin/(protected)/signals/queue/page.tsx` | Fetch total count in parallel; render "showing N of M" banner |
| `tests/admin/feedQueueChunk.test.ts` | **New** — pure tests for `chunk()` |

Explicitly NOT touched: `QueueClient.tsx` (755-line client island — its
in-memory filtering works unchanged on the capped set),
`signals/queue/actions.ts`, the monitor (`lib/monitor/`), `vercel.json`.

## Step-by-step implementation order

### Step 1 — `lib/admin/repos/feedQueue.ts`: cap the read

1. Near the top, export:
   ```ts
   /**
    * Cap on rows the queue page loads per render — newest first. Matches
    * BULK_IGNORE_MAX in signals/queue/actions.ts so "Ignore visible" can
    * always cover one full page. Older items surface as the newer ones are
    * triaged; countNewFeedItems() still reports the true backlog.
    */
   export const QUEUE_PAGE_LIMIT = 200;
   ```
2. Change the signature to `listNewFeedItems(limit: number = QUEUE_PAGE_LIMIT)`
   and append `.limit(limit)` after `.order("fetched_at", { ascending: false })`.

### Step 2 — `lib/admin/repos/feedQueue.ts`: chunk the `.in()` lookup

1. Add an exported pure helper (exported so it can be unit-tested without a DB):
   ```ts
   /** Splits into runs of `size` (last run may be shorter). Pure, order-preserving. */
   export function chunk<T>(items: T[], size: number): T[][] {
     if (size <= 0) throw new Error(`chunk size must be positive, got ${size}`);
     const out: T[][] = [];
     for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
     return out;
   }
   ```
2. In `loadExistingSignals`, replace the single `.in("source_native_id", unique)`
   query with one query per chunk of at most 100 ids, merging results into the
   same `Map`. Keep the existing "first row wins" behaviour
   (`if (... && !out.has(...))`). Sequential `for … of` over chunks is fine
   (2 round trips at today's cap); do not parallelise with `Promise.all` —
   simpler error semantics and the admin page is not latency-critical.

### Step 3 — `app/admin/(protected)/signals/queue/page.tsx`

1. Import `countNewFeedItems` and `QUEUE_PAGE_LIMIT` from the repo.
2. Fetch in parallel:
   ```ts
   const [items, totalNew] = await Promise.all([
     listNewFeedItems(),
     countNewFeedItems(),
   ]);
   ```
3. Between the "Two steps to publish" notice and the `QueueClient`, when
   `totalNew > items.length`, render a bordered muted banner (copy the styling
   of the existing dashed notice on that page):

   > Showing the newest **{items.length}** of **{totalNew}** staged items.
   > Older items appear as these are triaged. To clear abandoned items in
   > bulk, use the keyword presets with “Ignore visible”, or run
   > `npm run cleanup:old-deals` locally to ignore items staged more than
   > 60 days ago.

   Use Australian spelling in any copy you write.

### Step 4 — tests: `tests/admin/feedQueueChunk.test.ts`

Pure tests (run by `npm run test:admin`). Cover: empty array → `[]`; length
equal to size → one chunk; remainder → last chunk shorter; size 1; order
preserved across chunks; non-positive size throws. Import `chunk` directly
from `@/lib/admin/repos/feedQueue` — importing the module is safe without a
DB because `getSupabaseAdmin()` is only called inside functions, not at
module load (verify this stays true; if the import pulls in an env check,
move `chunk` to its own small module instead and note it).

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```

Then `npm run dev` → `/admin/signals/queue`: with prod's 295-item backlog you
should see exactly 200 items plus the "Showing the newest 200 of 295" banner,
and the existing search/preset/bulk-ignore controls working on those 200.

### Step 6 — operational burn-down (human/admin step; touches prod data)

1. `nvm use 20 && npm run cleanup:old-deals` — **dry-run**; read the
   `feed_items: staged 'new' older than 60d → ignored` section.
2. If the list looks right: `npm run cleanup:old-deals -- --write`. Every
   change is audit-logged (`actor_email = 'script:cleanup-old-deals'`) and
   reversible (it only flips `review_state`, never deletes).
3. In `/admin/signals/queue`, use the keyword presets to surface wanted
   merchants/categories, import those individually, then use "Ignore visible"
   on the filtered remainder in batches.

## Edge cases a weaker model would miss

1. **PostgREST `.in()` goes into the GET querystring.** With hundreds of ids
   (~20+ chars each, URL-encoded) the request URL grows past common 8–16 KB
   server limits and the whole queue page throws — an outage that appears
   only after the backlog grows, long after the code shipped. That's why the
   lookup is chunked even though Step 1's cap already bounds it to 200: the
   two limits protect independently, and someone may later raise the page
   limit without remembering the URL constraint.
2. **Keep `QUEUE_PAGE_LIMIT` equal to `BULK_IGNORE_MAX` (200).** If the page
   showed more items than a bulk-ignore call accepts, "Ignore visible" would
   silently drop the overflow (the action `.slice(0, BULK_IGNORE_MAX)`s its
   input). Equal caps keep "visible" and "ignorable" the same set.
3. **Newest-first + cap hides the oldest items.** Without the banner an admin
   would reasonably believe the queue holds 200 items and "finish" triage
   while 95 older items sit invisible forever. The dashboard's "Feed items to
   review" count (`countNewFeedItems`) already reports the true number — the
   queue page must not contradict it.
4. **Do not add pagination controls or a "load more".** The queue is a triage
   surface, not a browse surface: items leave it by being imported/ignored,
   which reveals the next oldest automatically. URL-param pagination would
   also fight `QueueClient`'s purely in-memory filters. The cap + banner +
   burn-down path is the whole design.
5. **Do not add bulk import.** README/CLAUDE.md safety model: import stays
   one-at-a-time (each import creates a *pending* signal needing separate
   approval). `ignoreVisibleItems` is safe precisely because ignore never
   touches public data.
6. **Do not "optimise" `ignoreVisibleItems`'s per-item loop into one
   `.update().in()`.** Its sequential per-item writes reuse the exact same
   single-item code path (`setFeedItemReviewState`) as the one-item action —
   deliberate, so bulk cannot behave differently from single. Out of scope.
7. **`chunk` must live where a test can import it without env vars.** The
   admin repos throw if instantiated in the browser and need Supabase env at
   call time — but module import must stay side-effect-free. If your test run
   fails at import time on missing env, do not add env vars to tests; move
   `chunk` into a standalone pure module (e.g. `lib/admin/chunk.ts`).
8. **`countNewFeedItems` already exists** (used by the dashboard). Reuse it;
   don't write a second count query or return a `{items, total}` tuple that
   changes the repo's public API more than needed.

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass.
- [ ] `npm run test:admin` passes, including new `chunk()` tests; `test:monitor`
      and `test:stack` stay green.
- [ ] `listNewFeedItems` contains `.limit(` and defaults to `QUEUE_PAGE_LIMIT`
      (200); `loadExistingSignals` never passes more than 100 ids to one
      `.in()` call.
- [ ] With more than 200 'new' rows in the DB, `/admin/signals/queue` renders
      200 items and a banner stating the true total (currently
      "…newest 200 of 295…"); with ≤200 rows, no banner appears.
- [ ] Existing queue behaviours unchanged: presets filter, single import
      creates a *pending* signal, "Ignore visible" ignores only the filtered
      set, nothing auto-publishes.
- [ ] `git diff --stat` touches exactly: `lib/admin/repos/feedQueue.ts`,
      `app/admin/(protected)/signals/queue/page.tsx`, the new test file (and
      `lib/admin/chunk.ts` only if edge case 7 forced the move).
- [ ] (Human step) After the cleanup dry-run is reviewed and `--write` is run,
      the queue total drops and every change appears in `/admin/audit`.
