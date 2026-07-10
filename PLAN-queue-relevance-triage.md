# PLAN-queue-relevance-triage — Make the 331-item feed queue triageable by relevance

> **Rank: 1 of 5 (2026-07-10 backlog).** Prod has **331 feed items in
> `review_state='new'`** (verified via Supabase 2026-07-10) and the queue grows
> on every monitor fetch. The queue UI already computes a High/Medium/Low
> relevance hint per item (`assessItem` in
> `app/admin/(protected)/signals/queue/QueueClient.tsx:146`) — but there is **no
> way to filter, sort, or bulk-act on it**. Triaging means reading 331 cards one
> by one. This plan turns the existing hint into the triage axis: relevance
> filter chips with counts, a "select all filtered" fast path, and an
> oldest-first sort — so "filter Low → select all → Ignore" clears the noise in
> three clicks. Pure client + one extracted pure module; no schema, no server
> reads/writes change.

## Goal

An admin can filter the loaded queue by relevance (with live counts per level),
sort it oldest-first, select **all filtered** items (not just the visible page)
up to the bulk cap, and ignore them in one confirmed action. The heuristics move
to a pure, unit-tested module. Nothing about what the queue *does* changes —
same server actions, same review states, nothing auto-triaged.

## Non-goals

- No change to `lib/admin/repos/feedQueue.ts` (server reads), `QUEUE_PAGE_LIMIT`
  (200), or the queue server page/actions. The 200-row window is deliberate: it
  matches `BULK_IGNORE_MAX` and drains — ignore a tranche, refresh, the next
  131 flow in.
- No auto-ignore / auto-import. Relevance stays a display + filter hint; a human
  clicks every destructive action behind the existing `window.confirm`.
- No new columns, no persistence of relevance, no DB reads from the client.

## Preconditions

- `git pull --rebase` on `main`; clean tree. `nvm use 20` (shell defaults to
  Node 15).
- This is client-component React work — no new framework APIs. Still read
  `AGENTS.md`; if you touch anything framework-level, check
  `node_modules/next/dist/docs/` first. Copy in-repo patterns over memory.
- Read fully before coding:
  - `app/admin/(protected)/signals/queue/QueueClient.tsx` — the whole file. Note
    the render-phase filter-reset pattern at lines 352–358 and the preset chip
    UI at lines 476–506 (your relevance chips copy this).
  - `app/admin/(protected)/signals/queue/actions.ts:145–182` —
    `ignoreVisibleItems` dedupes then **silently slices to `BULK_IGNORE_MAX =
    200`**. This is why the client must cap too (edge case 2).
  - `lib/repos/topDealsRanking.ts` — only to confirm
    `CATEGORY_PRIORITY_KEYWORDS` is exported and pure.

## Files to touch

| File | NEW/EDIT | Change |
|---|---|---|
| `lib/admin/queueRelevance.ts` | NEW | Pure relevance module: keyword lists, `Relevance` type, `assessFeedItem()` moved out of QueueClient |
| `app/admin/(protected)/signals/queue/QueueClient.tsx` | EDIT | Import from new module; relevance chips + counts; sort toggle; "Select all filtered"; include new state in `filterKey` |
| `tests/admin/queueRelevance.test.ts` | NEW | Unit tests for the pure module |

## Step-by-step

### Step 1 — extract `lib/admin/queueRelevance.ts` (pure)

Move, verbatim where possible, from `QueueClient.tsx`:
`HIGH_RELEVANCE_KEYWORDS` (lines 83–94), `MEDIUM_RELEVANCE_KEYWORDS` (97–112),
`type Relevance` (114), and the body of `assessItem` (146–174) renamed
`assessFeedItem`. Keep its imports: `findMerchantIdInText` from
`@/lib/sources/normalise`, `CATEGORY_PRIORITY_KEYWORDS` from
`@/lib/repos/topDealsRanking`, `stores` from `@/lib/data` — all pure/static, all
already imported by this client component today, so the bundle doesn't change.
Do NOT add `"use client"` (pure modules don't need it) and do NOT import React
or anything server-only. Type the parameter structurally
(`{ rawTitle: string; rawSummary: string; categories: string[] }`) instead of
importing `FeedQueueItem`, so tests don't need the repo types.
`RELEVANCE_META` (display styling) STAYS in QueueClient — presentation, not logic.

### Step 2 — relevance state + memoised assessment in QueueClient

1. Delete the moved code; import `assessFeedItem`, `Relevance` from
   `@/lib/admin/queueRelevance`.
2. Compute once per data load, not per keystroke:
   ```tsx
   const relevanceById = useMemo(
     () => new Map(items.map((i) => [i.id, assessFeedItem(i)])),
     [items]
   );
   ```
   The card render (line ~575) reads from this map instead of calling
   `assessItem(item)` inline.
3. Add `const [relevance, setRelevance] = useState<Relevance | "">("")`.
4. In the `filtered` `useMemo` (lines 319–341), add — alongside the existing
   source/query/category/preset checks:
   `if (relevance && relevanceById.get(item.id)?.relevance !== relevance) return false;`
   and add `relevanceById` + `relevance` to the dependency array.

### Step 3 — relevance chips with counts

Below the keyword-preset row, add three toggle chips (copy the preset button
styling and `aria-pressed` at lines 477–495): `High (n)`, `Medium (n)`,
`Low (n)`. Counts come from one `useMemo` tallying `relevanceById` values over
`items` (the loaded 200, NOT `filtered` — counts are stable context, not a
moving target). Clicking a chip sets/clears `relevance` (single-select; clicking
the active chip clears it). Extend `clearFilters()` (line 373) and
`anyFilterActive` (line 343) to include it.

### Step 4 — sort toggle

Add `const [oldestFirst, setOldestFirst] = useState(false)` and sort a copy
inside the `filtered` memo (after filtering):
`sorted = [...matches].sort((a, b) => oldestFirst ? a.fetchedAt.localeCompare(b.fetchedAt) : b.fetchedAt.localeCompare(a.fetchedAt))`.
Sort by `fetchedAt` (never null, uniform ISO — lexicographic compare is
correct), NOT `postedAt` (nullable, `feedQueue.ts:56`). UI: a small
`<select>` styled with the existing `controlClass` (line 226) — "Newest first" /
"Oldest first" — next to the source dropdown.

### Step 5 — "Select all filtered"

Next to the existing "Select all shown ({paged.length})" (line 522), add
"Select all filtered ({Math.min(filtered.length, 200)})":

```tsx
function selectAllFiltered() {
  setSelected(new Set(filtered.slice(0, 200).map((i) => i.id)));
}
```

When `filtered.length > 200`, render a one-line note: "Bulk actions are capped
at 200 items per pass — ignore this batch, then refresh to load more." Use a
local `const SELECT_ALL_CAP = 200` with a comment that it mirrors
`BULK_IGNORE_MAX` in `actions.ts` (don't import from a `"use server"` file —
importing non-action exports from a use-server module is a build error).

### Step 6 — filter-reset correctness (do not skip)

Extend `filterKey` (line 352) to include the new state:
```tsx
const filterKey = `${source} ${query} ${category} ${presets.join(" ")} ${relevance} ${oldestFirst}`;
```
This is the render-phase reset that clears `selected` and pagination whenever
the view changes. **Missing this is a correctness bug**: select 180 Low items,
flip the filter to High, click "Ignore selected" — you'd ignore the invisible
Low selection while looking at High items.

### Step 7 — tests (`tests/admin/queueRelevance.test.ts`)

Table-driven over `assessFeedItem`:
- Title mentioning a tracked store (pick one from `lib/data.ts`, e.g. "JB Hi-Fi
  4K TV deal") → `high` + `suggestedMerchant` set.
- "10% off Ultimate **gift card** at Coles" → `high` (core keyword).
- "Massive **clearance** on garden gnomes" → `medium` (generic cue).
- "New podcast episode about superannuation" → `low`.
- Store mentioned only in `rawSummary` → `high` relevance but
  `suggestedMerchant` **null** (title-only match — lines 153–158 encode this
  asymmetry deliberately; pin it).
- Case-insensitivity: "CASHBACK" → `high`.

### Step 8 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack
```
Then `npm run dev` (Node-20 PATH prefix per the preview gotcha; `rm -rf
.next/dev` if Turbopack panicked previously) → `/admin/signals/queue`:
chips show counts summing to the loaded item total; Low + "Select all filtered"
+ "Ignore selected" works and the confirm dialog states the count; switching
any filter clears the selection; sort toggle reorders; "Showing X of Y" stays
consistent.

## Edge cases & traps

1. **Stale-selection ignore (Step 6).** The selection survives filter changes
   unless `filterKey` includes every filter input. The existing code resets on
   source/query/category/presets — your two new states must join it.
2. **The silent 200 slice.** `ignoreVisibleItems` slices to 200 *after* dedupe
   and then reports `{ ok: true }` (`actions.ts:164–167`) — a 331-item selection
   would "succeed" having ignored only 200, and the cleared selection tells the
   admin everything is done. Cap at selection time and say so in the UI.
3. **Rate limit is 30 mutations/60s** (`lib/admin/rate-limit.ts:31–33`), but one
   bulk ignore consumes **one** unit (single `checkAdminRateLimit` call for the
   batch) — so batch-ignoring is cheap; per-item clicking is what burns budget.
   Don't "improve" bulk into per-item action calls.
4. **Relevance merchant hints come from the static `lib/data.ts` store list,
   not the DB** (prod has 9 published DB stores; the static list is the
   client-safe superset). This is pre-existing and correct for a hint. Do NOT
   "fix" it by fetching stores client-side.
5. **`useMemo` the assessment (Step 2.2).** `assessFeedItem` runs dozens of
   `includes()` scans per item; the `filtered` memo re-runs on every search
   keystroke. Assess once per `items`, filter against the Map.
6. **Sort inside the memo, on a copy.** `.sort()` mutates; sorting `items` or
   `filtered` in place breaks React's referential assumptions. Spread first.
7. **Counts on `items`, not `filtered`** — otherwise selecting the High chip
   makes Medium/Low counts collapse to 0 and the chips stop being navigation.
8. **Australian spelling** in all new UI copy ("prioritise", "colour" — and the
   existing tone: sentence-case labels, muted helper text).

## Acceptance criteria

- [ ] `nvm use 20 && npm run lint && npm run build` pass.
- [ ] `npm run test:admin` passes, including the new `queueRelevance.test.ts`
      cases (incl. the title-vs-summary asymmetry pin).
- [ ] `npm run test:monitor` and `npm run test:stack` still pass.
- [ ] `/admin/signals/queue`: three relevance chips render with counts that sum
      to the loaded-item count; toggling filters the list and updates
      "Showing X of Y".
- [ ] "Select all filtered (N)" selects min(filtered, 200); with >200 filtered,
      the cap note renders.
- [ ] Changing ANY filter (including relevance and sort) clears the selection
      and resets pagination.
- [ ] "Ignore selected" still confirms, still shows rate-limit errors inline,
      and after success the items disappear on refresh (audit row visible at
      `/admin/audit` with `bulk: true` and the count).
- [ ] `git diff --stat` touches exactly: `lib/admin/queueRelevance.ts`,
      `app/admin/(protected)/signals/queue/QueueClient.tsx`,
      `tests/admin/queueRelevance.test.ts`.

## Commit

```
Add relevance filter, sort and select-all-filtered to feed queue triage
```
Gate: lint + build + all three test suites (admin logic changed → `test:admin`
mandatory). `git status` must show only the three files. Push to `origin/main`
autonomously (per project git workflow), after `git pull --rebase`.
