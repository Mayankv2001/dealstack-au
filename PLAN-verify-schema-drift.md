# PLAN: `npm run verify:schema` — detect prod/migration schema drift before it bites again

> **Rank: 2 of 5.** Schema drift is this project's most-repeated production
> incident class: migrations were historically applied to prod by hand and
> untracked; migration 005's `feed_items.hidden_from_homepage` column was
> silently missing from prod for weeks (found 2026-07-08, applied 2026-07-09).
> PROJECT_STATE.md §10 and FINAL-LAUNCH-CHECKLIST.md §3 both say "verify via
> `information_schema.columns`, not just table names" — but there is **no
> tooling** for that; it's a manual SQL-editor ritual that gets skipped. This
> plan adds a read-only script that probes the live database for **every
> table and column the migrations define** and fails loudly on any gap. With
> two Claude accounts sharing `main` and migrations reviewed/applied by hand,
> this is cheap permanent insurance for every future migration.

## Prerequisites

- `nvm use 20`. Script env mirrors the seed/cleanup scripts:
  `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
- Read fully before coding:
  - `scripts/cleanup-old-deals.ts` — copy its skeleton exactly: the
    `loadEnvFile(".env.local")` preamble, `createClient(supabaseUrl(),
    supabaseServiceRoleKey(), { auth: { persistSession: false,
    autoRefreshToken: false } })`, CLI arg parsing, and `--help`.
  - Every file in `supabase/migrations/` (001–007) — the manifest is derived
    from these and ONLY these.

## Goal

`npm run verify:schema` connects to the configured Supabase project with the
service-role key, verifies that every table and every column declared across
`supabase/migrations/001…007` actually exists, prints a per-table OK/FAIL
report, and exits 0 (clean) / 1 (drift found) / 2 (config error, e.g. missing
env). Purely read-only — it can never modify anything.

## Why not query `information_schema` directly?

**This is the trap in this task.** The script talks to Supabase through
supabase-js, which speaks PostgREST — and PostgREST only exposes the `public`
schema. `db.from("information_schema.columns")` does not work, and adding an
RPC would itself require a migration (chicken-and-egg: you'd be verifying
drift with a function that may itself have drifted). Instead, **probe**: a
PostgREST request that selects explicit columns validates them server-side.

```ts
const { error } = await db.from(table).select(columns.join(",")).limit(0);
```

- All columns exist → no error (and `limit(0)` transfers no row data).
- A column is missing → error with Postgres code `42703`, message naming the
  column (e.g. `column feed_items.hidden_from_homepage does not exist`).
- The table is missing → error code `42P01` / PostgREST `PGRST205`
  ("Could not find the table … in the schema cache").

When the whole-table probe fails with a column error, re-probe that table
**one column at a time** to enumerate every missing column (the batch error
only names the first one).

## Exact files to touch

| File | Change |
|---|---|
| `scripts/verify-schema.ts` | **New** — the probe script + inline manifest |
| `package.json` | Add `"verify:schema": "tsx scripts/verify-schema.ts"` |
| `FINAL-LAUNCH-CHECKLIST.md` | §3: replace the manual information_schema note with the command |
| `docs/production-readiness.md` | Mention the command wherever migration verification is described |

No app code, no migrations, no test-suite changes (the script is standalone;
see acceptance criteria for how it is verified).

## Step-by-step implementation order

### Step 1 — build the manifest (inside `scripts/verify-schema.ts`)

Hardcode a manifest `const EXPECTED: Record<string, string[]>` mapping each
table to its full column list. Derive it by reading the migration SQL — do
not guess, do not use `lib/supabase/database.types.ts` (see edge case 1).

Extraction rules:
- Every `create table [if not exists] <name> (…)` contributes the table and
  each column name (first identifier of each column line; skip lines starting
  with `check`, `constraint`, `primary key`, `unique`, `foreign key`, and
  comment lines).
- Every `alter table <name> add column [if not exists] <col>` appends to that
  table. There are exactly two: `feed_sources.source_type` (004) and
  `feed_items.hidden_from_homepage` (005).
- Ignore indexes, triggers, functions, policies, RLS statements.

The complete table list (verify against the files; count = 15):
- **001**: `stores`, `gift_card_offers`, `cashback_offers`, `points_offers`,
  `ozbargain_signals`, `weekly_deals`, `admins`, `audit_log`
- **002**: `feed_sources`, `feed_items`, `feed_fetch_log`
- **003**: `compliance_reviews`
- **004**: `offer_change_candidates`
- **006**: `admin_rate_limits`
- **007**: `card_offers`

Annotate each manifest entry with a comment naming its source migration, so
future migrations have an obvious place to add their columns. Add a loud
comment at the top: **"When you add a migration, add its tables/columns here
— the launch checklist runs this script."**

### Step 2 — probe logic

```ts
async function verifyTable(db, table, columns): Promise<TableResult>
```

1. Whole-table probe: `select(columns.join(","))` + `.limit(0)`.
2. Success → `{ table, ok: true }`.
3. Failure whose message matches `/could not find the table|relation .* does
   not exist|PGRST205/i` → `{ table, ok: false, missingTable: true }`. Do
   NOT per-column probe a missing table.
4. Any other failure → per-column probes (sequential, one `select(col)` +
   `.limit(0)` each), collecting `missingColumns` for those that error, and
   `unexpectedErrors` for errors that do not look like a missing column
   (report those verbatim rather than mislabelling them as drift).

Run tables sequentially (15 tables, worst case ~15 + ~30 requests — a few
seconds; simplicity beats parallel here).

### Step 3 — report + exit codes

Print a checklist-style report:

```
▸ stores                      OK (25 columns)
▸ feed_items                  MISSING COLUMNS: hidden_from_homepage
▸ card_offers                 MISSING TABLE (apply 007_card_offers.sql)
──────────────────────────────
DRIFT FOUND: 2 tables affected. Apply the migrations above, then re-run.
```

- All OK → exit 0 with a one-line "schema matches migrations 001–007".
- Any missing table/column → exit 1. Map each missing table to its migration
  file in the message (a small `TABLE_TO_MIGRATION` record).
- Missing env vars → print which and exit 2 **before** creating the client
  (`supabaseUrl()` / `supabaseServiceRoleKey()` in `lib/env.ts` throw or
  return empty — check how they behave and handle both).
- Support `--help`. No `--write` flag exists or ever should.

### Step 4 — wire up + docs

- `package.json`: add `verify:schema` next to `cleanup:old-deals`.
- `FINAL-LAUNCH-CHECKLIST.md` §3: change the verification bullet to run
  `npm run verify:schema` (keep the historical context sentence).
- `docs/production-readiness.md`: add the command to the migrations section.
- Do NOT add it to any cron, CI hook, or app route — manual tool only.

### Step 5 — verify

```bash
nvm use 20
npm run lint && npm run build      # build must stay green (script is type-checked by lint only)
npm run verify:schema              # against the real project: expect all OK, exit 0
echo $?
```

Then prove it detects drift (read-only proof, no DB change needed): add a
fake column name (e.g. `zz_drift_probe`) to one manifest entry locally, run
again, confirm exit 1 naming exactly that column, then remove it.

## Edge cases a weaker model would miss

1. **Do not derive the manifest from `lib/supabase/database.types.ts`.** That
   file is generated FROM the live prod schema (`npm run types:gen` uses
   `--project-id`), so it is blind to precisely the drift this script hunts:
   if prod is missing a column, the generated types are missing it too. The
   migrations SQL is the only valid source of intent.
2. **`information_schema` is unreachable via supabase-js** (PostgREST exposes
   only `public`). Anyone who "simplifies" to
   `db.from("information_schema.columns")` gets a table-not-found error that
   looks like drift. The probe approach is load-bearing, not a style choice.
3. **`select("*")` validates nothing** — it succeeds regardless of which
   columns exist. Columns must be listed explicitly.
4. **Service-role key is required, not optional.** Staging tables
   (`feed_items`, `feed_sources`, `feed_fetch_log`, `offer_change_candidates`,
   `admin_rate_limits`, `admins`, `audit_log`, `compliance_reviews`) have no
   anon SELECT policy. With the anon key, RLS-denied reads on those tables
   return empty-but-OK or permission errors depending on policy shape — either
   way you'd misreport. Use `supabaseServiceRoleKey()` like the cleanup
   script, and never log the key.
5. **A batch probe error names only the FIRST missing column.** Without the
   per-column fallback, a table missing three columns reports one, the user
   fixes it, re-runs, finds the next — a frustrating loop. Enumerate all.
6. **Distinguish "missing" from "broken".** A network failure, paused
   Supabase project, or wrong URL must not be reported as schema drift.
   Anything that isn't a recognisable 42703/42P01/PGRST205 gets its own
   "unexpected error" bucket and still exits non-zero (use exit 2) with the
   raw message.
7. **Column-name extraction from SQL has traps:** table-level `check (…)`
   constraint lines and multi-line `check` continuation lines (see
   `ozbargain_signals.sentiment` in 001) start with keywords, not column
   names — the "skip lines starting with constraint keywords" rule handles
   them, but eyeball each table's final count against the migration file.
   Sanity anchors: `card_offers` has 19 columns (007), `feed_items` includes
   `hidden_from_homepage` (005), `feed_sources` includes `source_type` (004),
   `ozbargain_signals` includes `is_sample`.
8. **`.limit(0)` keeps it free.** Without it a `select` on `feed_items`
   pulls hundreds of staged rows over the wire for nothing.
9. **Never auto-apply.** Tempting "fix it" flags (`--apply-missing`) violate
   the standing rule that migrations are reviewed before prod. The script
   only points at which `supabase/migrations/*.sql` file to apply by hand.

## Acceptance criteria

- [ ] `npm run verify:schema` against the configured project prints one line
      per manifest table (15 lines), reports OK for all, and exits 0.
- [ ] With a fabricated column temporarily added to the local manifest, the
      run reports exactly that column under the right table and exits 1;
      removing it restores exit 0. (This proves detection without touching
      the DB.)
- [ ] With `SUPABASE_SERVICE_ROLE_KEY` unset, the script exits 2 with a clear
      message and makes zero network calls.
- [ ] The manifest includes `feed_sources.source_type` and
      `feed_items.hidden_from_homepage` (the two alter-table columns — the
      005 column is the one that actually drifted in prod).
- [ ] The script contains no `.update(`, `.insert(`, `.upsert(`, `.delete(`,
      or `.rpc(` calls; `grep -n "update\|insert\|delete" scripts/verify-schema.ts`
      shows matches only in comments/strings, if any.
- [ ] `npm run lint` and `npm run build` pass on Node 20;
      `git diff --stat` touches only the four files listed above.
- [ ] FINAL-LAUNCH-CHECKLIST.md §3 now instructs `npm run verify:schema`.
