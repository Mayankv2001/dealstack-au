# PLAN-seed-signals-conflict — Make `npm run seed` survive diverged prod signals

> **Rank: 5 of 5 (2026-07-10 follow-on backlog).** PROJECT_STATE §10
> documents a recurring operational failure: "Full `npm run seed` fails on
> `ozbargain_signals` (source_native_id unique constraint + diverged prod
> data). Insert new signals **individually**, not via full seed." The
> mechanics (verified 2026-07-10): `seedTable` (`scripts/seed.ts:73-99`)
> upserts with `onConflict: "id", ignoreDuplicates: !OVERWRITE` — i.e.
> `INSERT … ON CONFLICT (id) DO NOTHING`. But `ozbargain_signals` carries a
> **second** unique constraint, `source_native_id text unique`
> (`supabase/migrations/001_initial_schema.sql:131`), which the conflict
> target does not cover. Once prod holds a signal with the same
> `source_native_id` under a **different id** (the monitor's import flow
> and manual admin inserts both produce these), the seed row raises 23505,
> the whole multi-row statement aborts, `seedTable` throws — and because
> signals seed at `scripts/seed.ts:277`, **`weekly_deals` (:278) and
> `card_offers` never seed either**. This matters beyond convenience:
> PROJECT_STATE §7 says "Prod serves the Supabase DB — re-seed after
> editing static offer data", so re-seeding is a standing operational step
> that currently requires a documented manual workaround. This plan makes
> the signals step skip-and-report conflicted rows instead of aborting,
> via a pure, unit-tested filter.

## Prerequisites

- `git pull --rebase`; clean tree. **Node 22 for running the seed**
  (PROJECT_STATE §9: `npm run seed` needs Node 22 for WebSocket); Node 20
  for lint/build/tests as usual.
- Read fully before coding:
  - `scripts/seed.ts` — the whole file (~290 lines): the `--overwrite`
    flag, `seedTable` (:73-99), the per-table ordering in `main()`
    (:270-285, signals at :277), and the `.env.local` loader.
  - `supabase/migrations/001_initial_schema.sql:129-140` — the
    `ozbargain_signals` DDL: `id text primary key`,
    `source_native_id text unique` (nullable).
  - `tests/admin/dbFallback.test.ts` — the house style for small pure-logic
    test files under `tests/admin/`.

## Goal

`npm run seed` (and `npm run seed -- --overwrite`) completes all tables even
when prod `ozbargain_signals` contains rows sharing a `source_native_id`
with seed rows under different ids. Conflicted seed rows are skipped with a
per-row log line naming the reason; everything else seeds normally. The
filter is a pure function with unit tests. PROJECT_STATE §10's workaround
note is updated to "resolved".

## Exact files to touch

| File | Change |
|---|---|
| `scripts/seed-filters.ts` | **New** — pure `filterSeedableSignals()` (no env, no client, no side effects) |
| `scripts/seed.ts` | Pre-query existing signal keys; filter signal rows through the new function before `seedTable` |
| `tests/admin/seedFilters.test.ts` | **New** — unit tests for the filter |
| `PROJECT_STATE.md` | §10: mark the seed-signals gotcha resolved (keep the history, add the fix + commit hash) |

No migrations, no RLS changes, no app code. Other tables' seeding is
untouched (their only unique key is `id`, which `onConflict: "id"` already
handles).

## Step-by-step implementation order

### Step 1 — `scripts/seed-filters.ts` (pure)

```ts
/** Minimal row views — only the keys the filter needs. */
export interface SignalSeedRow {
  id: string;
  source_native_id: string | null;
}
export interface ExistingSignalKey {
  id: string;
  source_native_id: string | null;
}
export interface SignalFilterResult<T extends SignalSeedRow> {
  seedable: T[];
  /** Rows dropped because their source_native_id belongs to a DIFFERENT id in prod. */
  skipped: { row: T; ownedById: string }[];
}

export function filterSeedableSignals<T extends SignalSeedRow>(
  rows: T[],
  existing: ExistingSignalKey[]
): SignalFilterResult<T>
```

Logic: build a `Map<source_native_id, id>` from `existing`, **ignoring
entries whose `source_native_id` is null**. A seed row is skipped iff its
`source_native_id` is non-null AND the map holds it under a different
`id`. Same-id matches stay seedable (the `ON CONFLICT (id)` path handles
them as before — no behaviour change). Null-native-id rows always stay
seedable (Postgres unique allows any number of NULLs).

### Step 2 — wire into `scripts/seed.ts`

Immediately before the `ozbargain_signals` `seedTable` call (:277):

1. `const { data: existing, error } = await supabase.from("ozbargain_signals").select("id, source_native_id").not("source_native_id", "is", null);`
   — throw on `error` (same style as `seedTable`).
2. `const { seedable, skipped } = filterSeedableSignals(signalRows, existing ?? []);`
3. For each skipped row:
   `console.log(\`• ozbargain_signals: skipped "\${row.id}" — source_native_id "\${row.source_native_id}" already belongs to prod row "\${ownedById}" (diverged data; see PROJECT_STATE §10)\`);`
4. `await seedTable(supabase, "ozbargain_signals", seedable);`

Apply the same path in both normal and `--overwrite` mode — no branching
(see edge case 3).

### Step 3 — tests (`tests/admin/seedFilters.test.ts`)

Pure, offline, covering:
- No existing rows → everything seedable, nothing skipped.
- Existing row with same native id + **different** id → that seed row
  skipped, `ownedById` reported; others untouched.
- Existing row with same native id + **same** id → stays seedable (upsert
  path unchanged).
- Seed rows with `source_native_id: null` → never skipped, even when
  existing rows also have nulls.
- Mixed batch: one of each of the above in a single call — counts and
  ordering of `seedable` preserved.

### Step 4 — docs

`PROJECT_STATE.md` §10: replace the "Insert new signals individually"
instruction with the resolved state — full seed now skips diverged-native-id
rows with a per-row log line; manual single-row inserts no longer needed.
Reference the commit hash.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build
npm run test:admin && npm run test:monitor && npm run test:stack

nvm use 22          # seed needs Node 22 (PROJECT_STATE §9)
npm run seed        # against the real project — must complete ALL tables
npm run seed        # second run: idempotent, zero new inserts, same skips
```

The run must print either zero skip lines (no divergence right now) or one
line per diverged row — and, either way, reach `weekly_deals` and
`card_offers` afterwards (the tables that today never seed when signals
abort).

## Edge cases a weaker model would miss

1. **`ON CONFLICT (id) DO NOTHING` does not protect against OTHER unique
   constraints.** That is the entire bug: the conflict target names `id`,
   so a `source_native_id` collision is an error, not a skipped duplicate —
   and one bad row aborts the whole multi-row insert (statement-level
   atomicity). Do NOT "fix" this by switching the upsert to
   `onConflict: "source_native_id"`: that column is nullable (multiple
   seed rows may carry null → PostgREST upsert with a null conflict key
   misbehaves), and it would merely move the abort to `id` collisions
   instead. Pre-filtering is the only shape that handles both constraints.
2. **`scripts/seed.ts` executes `main()` on import — never import it from
   a test.** That is why the filter lives in its own module
   (`scripts/seed-filters.ts`) with zero imports from `seed.ts`, no env
   reads, and no Supabase client. A test that imports `seed.ts` would run
   a live seed against whatever `.env.local` points at.
3. **`--overwrite` needs the same filter, not a bypass.** Overwrite mode
   upserts on `id`; a seed row whose native id belongs to a different prod
   row still violates the unique constraint mid-statement. Skipping it
   (with the log line) is correct in both modes; "overwrite" never meant
   "steal another row's native id".
4. **Null `source_native_id` is a first-class case, not an edge to
   ignore.** Manually-created signals have null native ids (the column is
   nullable by design; Postgres unique permits many NULLs). The filter must
   ignore nulls on BOTH sides — a null never conflicts with anything. The
   tests pin this.
5. **The pre-query must exclude nulls server-side**
   (`.not("source_native_id", "is", null)`) — cheaper, and it keeps the
   Map-building loop honest. Note PostgREST's default row cap (~1000): the
   signals table is far below it today, but add a one-line comment saying
   the query relies on that; if signals ever exceed the cap, paginate.
6. **Skipped ≠ silent.** Every skipped row prints id + native id + the
   owning prod id. A silently-shrinking seed is how illustrative data and
   prod quietly diverge further; the log line is what tells the operator
   "prod already has this signal under another id — edit it in admin if
   the static version matters".
7. **Don't generalise `seedTable`.** Only `ozbargain_signals` has a second
   unique column; threading a "secondary key" concept through the generic
   helper complicates five call sites to fix one. Special-case at the call
   site, where the constraint lives.
8. **Node version split:** lint/build/tests on Node 20, the seed run itself
   on Node 22 (WebSocket dependency — PROJECT_STATE §9/§10). Getting this
   wrong looks like a mysterious seed failure and wastes an hour.
9. **Service-role only, never logged.** The pre-query uses the same client
   `seed.ts` already builds; no new env handling, and no printing of env
   values in the new log lines.

## Acceptance criteria

- [ ] `tests/admin/seedFilters.test.ts` passes with all five cases;
      `npm run test:admin` green (plus `test:monitor`/`test:stack`
      untouched-green) on Node 20.
- [ ] `npm run seed` (Node 22, real project) completes **all** tables —
      including `weekly_deals` and `card_offers` — printing a skip line per
      diverged signal (or none when prod has no divergence).
- [ ] Running it twice in a row is idempotent: second run inserts 0 new
      rows and prints identical skip lines.
- [ ] `npm run seed -- --overwrite` also completes; overwritten rows are
      only ever matched by `id` (spot-check one signal's values reset while
      its diverged sibling is skipped, not modified).
- [ ] `grep -n "filterSeedableSignals" scripts/seed.ts` shows exactly one
      call site, placed before the `ozbargain_signals` `seedTable` call;
      no other table's seeding path changed.
- [ ] `PROJECT_STATE.md` §10 updated to resolved (with hash);
      `npm run lint` + `npm run build` green.
