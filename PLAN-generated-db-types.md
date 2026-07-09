# PLAN: Generated Supabase types — replace LooseDB with compile-time schema safety

> **Rank: 5 of 5** (highest engineering payoff, biggest diff — do it last, on
> its own branch/commit).
> Every Supabase client in this repo is typed with `LooseDB`
> (`lib/supabase/server.ts`), a `Record<string, …>` schema that accepts any
> table and column name. That looseness has already bitten once: migration
> 004's `feed_sources.source_type` column was missing in prod for weeks and
> nothing failed at compile time (see the repo's memory of the 2026-06-28
> incident). Generating types from the real production schema and threading
> them through the three client factories makes wrong table/column names,
> wrong insert payload shapes, and schema drift into build failures.

## Context you must load first

- Run `nvm use 20` for everything in this plan.
- The Supabase project ref is `numgsivlrglflsnqehac`. **Production is the
  source of truth for the schema** — migrations were applied by hand
  historically and the SQL files can drift from prod, so generate FROM prod,
  never from the local migration files.
- Read before editing:
  - `lib/supabase/server.ts` (LooseDB, DbClient, fromDbOrStatic/fromDbOrDemo)
  - `lib/supabase/admin.ts`, `lib/supabase/ssr.ts` (the other two factories)
  - `lib/admin/repos/dashboard.ts` — `countAll` / `countWhere` / `queryRecent`
    take table names as plain `string` (the main compile-fallout site)
  - `lib/admin/repos/audit.ts` — inserts a `Record<string, unknown>` diff
    into a jsonb column (the main Json-cast site)
  - `tests/admin/dbFallback.test.ts`, `tests/admin/rate-limit.test.ts` —
    inject fake clients/stores that must keep type-checking
- This is a **types-only change**: `git diff` must show no behavioural edits.
  If a new type error exposes a real column mismatch between code and prod,
  STOP and report it to the user instead of "fixing" either side silently.

## Goal

`SupabaseClient<Database>` (generated) everywhere `SupabaseClient<LooseDB>`
is used today; `LooseDB` deleted; a repeatable `npm run types:gen` script;
build fails on any reference to a nonexistent table or column.

## Exact files to touch

| File | Change |
|---|---|
| `lib/supabase/database.types.ts` | **New, generated** — do not hand-edit |
| `package.json` | Add `types:gen` script |
| `lib/supabase/server.ts` | `Database` replaces `LooseDB`; export `Json` re-export if needed |
| `lib/supabase/admin.ts`, `lib/supabase/ssr.ts` | Generic parameter swap |
| `lib/admin/repos/dashboard.ts` | Table-name params typed as a schema-derived union |
| `lib/admin/repos/audit.ts` (+ any repo the compiler flags) | `Json` casts at jsonb write sites |
| `eslint.config.*` | Ignore the generated file (only if lint flags it) |
| `tests/admin/*.test.ts` | Fake-client casts (only if the compiler flags them) |

`scripts/*.ts` create their own untyped clients and are NOT in scope.

## Step-by-step implementation order

### Step 1 — generate the types

Preferred (needs a one-time `npx supabase login`, which stores a personal
access token; never commit the token):

```bash
nvm use 20
npx supabase gen types typescript --project-id numgsivlrglflsnqehac --schema public \
  > lib/supabase/database.types.ts
```

If CLI auth is unavailable, two equivalent fallbacks: the Supabase MCP
`generate_typescript_types` tool, or Supabase Dashboard → API Docs →
"Generate types". The output must be byte-for-byte what the generator emits,
plus one leading comment block you add:

```ts
// GENERATED FILE — do not edit by hand.
// Source of truth: the PRODUCTION schema (project numgsivlrglflsnqehac),
// because migrations have historically been applied by hand and
// supabase/migrations/*.sql can drift from prod.
// Regenerate with: npm run types:gen
```

Sanity-check the file contains all 15 tables (admins, admin_rate_limits,
audit_log, card_offers, cashback_offers, compliance_reviews, feed_fetch_log,
feed_items, feed_sources, gift_card_offers, offer_change_candidates,
ozbargain_signals, points_offers, stores, weekly_deals). If any are missing,
the generation ran against the wrong project — stop.

### Step 2 — `package.json`

```json
"types:gen": "supabase gen types typescript --project-id numgsivlrglflsnqehac --schema public"
```

(Project refs are not secrets — the same ref is embedded in the public
`NEXT_PUBLIC_SUPABASE_URL`.) Document that the caller redirects output:
`npm run types:gen > lib/supabase/database.types.ts`.

### Step 3 — swap the generic in the three factories

In `lib/supabase/server.ts`:
- `import type { Database } from "./database.types";`
- Delete the `Row`/`LooseDB` type definitions.
- `export type DbClient = SupabaseClient<Database>;`
- `createClient<Database>(...)` in `getSupabaseServer`.

In `lib/supabase/admin.ts` and `lib/supabase/ssr.ts`: replace their
`LooseDB` imports/generics with `Database` (import it from
`./database.types` or re-export from `./server.ts` — pick one style and use
it in both).

### Step 4 — fix compile fallout, in dependency order

Run `npx tsc --noEmit` (or `npm run build`) after each sub-step:

1. **Dynamic table names** (`lib/admin/repos/dashboard.ts` `countAll`,
   `countWhere`, `publishCount`, `queryRecent`): a typed client rejects
   `.from(someString)`. Define once:
   ```ts
   type PublicTable = keyof Database["public"]["Tables"] & string;
   ```
   and change the `table: string` parameters to `table: PublicTable`. All
   existing call sites pass literals, so they compile unchanged. With a typed
   client, `.eq()`/`.order()` column arguments on a generic table may also
   need the query built with the table narrowed — if the generic-over-tables
   approach fights the supabase-js conditional types, the pragmatic escape
   hatch is `.from(table as PublicTable)` plus keeping the response casts,
   NOT reverting the client to loose typing.
2. **jsonb write sites**: `Record<string, unknown>` and typed arrays
   (`Citation[]`) are **not** assignable to the generated `Json` type.
   Expect casts like `diff: (event.diff ?? null) as Json` in
   `lib/admin/repos/audit.ts`, and similar at any insert/update that writes
   `citations`, `logo_theme`, or `diff` columns (seed writes live in
   `scripts/` and are out of scope). Import `Json` from the generated file.
   Cast at the write site only — do not widen interface fields to `Json`.
3. **Read-side casts stay.** Repos read with
   `(data ?? []) as unknown as SomeRow[]` — leave every one of them. They
   exist partly because PostgREST returns Postgres `numeric` as strings,
   which the generated types call `number`; the `toNumber`/`toNumberOrNull`
   coercers remain necessary. Removing casts/coercers is NOT part of this
   plan.
4. **Embedded relations** (`store:stores(name)`, `source:feed_sources(label)`)
   type differently under a real schema — the existing `as unknown as` casts
   absorb this; only touch if the compiler complains.
5. **Tests**: fakes injected into `fromDbOrDemo` (`tests/admin/dbFallback.test.ts`)
   are typed against `DbClient`; add `as unknown as DbClient` on the fakes if
   they stop compiling. Never weaken the production types to fit a test fake.

### Step 5 — lint the generated file

Run `npm run lint`. If the generated file trips rules, add
`lib/supabase/database.types.ts` to the ESLint ignore list in the flat
config — do not hand-edit the generated file and do not disable rules
globally.

### Step 6 — prove the guard works, then verify everything

1. Temporarily add to any repo:
   `await db.from("card_offers").insert({ not_a_real_column: 1 } as never);`
   — without the `as never` it must FAIL `npx tsc --noEmit`. Confirm the
   error, then delete the line. (This is the whole point of the change;
   don't skip the demonstration.)
2. Full gate:
   ```bash
   nvm use 20
   npm run lint && npm run build
   npm run test:monitor && npm run test:stack && npm run test:admin
   ```
3. `npm run dev`, load `/`, `/deals`, `/cards`, `/admin/dashboard` — all
   render identically to before (types-only change).

## Edge cases a weaker model would miss

1. **Generate from prod, not from `supabase/migrations/`.** The migrations
   are applied by hand and have drifted before (004 was half-applied for
   weeks). Types generated from local SQL would encode the drift you're
   trying to catch. Also record this rationale in the file header so nobody
   "fixes" the workflow later.
2. **`numeric` lies.** The generated types say `number` for Postgres
   `numeric`, but supabase-js delivers strings at runtime. The repo already
   defends with `toNumber`/`toNumberOrNull` and response casts — a model that
   "cleans up now-redundant casts" introduces `NaN`-free-looking code that
   breaks at runtime. Leave every read cast and coercer alone.
3. **`Json` is stricter than `Record<string, unknown>`** (its object arm has
   an index signature over `Json`, so `unknown` values don't unify). The fix
   is a cast at each jsonb *write* site, not changing public interfaces like
   `AuditEvent.diff` — those are consumed by callers passing plain object
   literals and must stay ergonomic.
4. **Dynamic-table helpers are the one genuinely hard fallout.**
   supabase-js's typed `.from()` resolves conditional types per table; a
   parameter typed as the union of all tables can produce unions the builder
   methods choke on. The `PublicTable` union usually works for
   `select/count/eq` chains used here; if it doesn't, cast at `.from()` and
   keep the rest — do NOT respond by reintroducing a loose schema for the
   whole client.
5. **`getSupabaseAdmin` has a browser guard and env requirements at call
   time** — nothing at module scope. Keep it that way; if you restructure
   imports, module-load side effects would break the pure tests
   (`tests/admin/*`) that import these files without env vars.
6. **Don't chase scripts.** `scripts/seed.ts`, `scripts/cleanup-old-deals.ts`
   etc. build their own `createClient()` without the generic on purpose (they
   run standalone under different Node versions). Typing them is a separate,
   optional task — expanding scope here doubles the diff for little gain.
7. **Regeneration is a manual, deliberate act.** Do not add types
   generation to `build` or CI — it needs network + auth and would couple
   builds to Supabase availability. The `types:gen` script + header comment
   is the workflow.
8. **If prod schema and code disagree, that's a finding, not a fix-target.**
   E.g. if the generated types reveal a column the code writes but prod
   lacks, report it — changing prod schema requires the human's migration
   review per CLAUDE.md.

## Acceptance criteria

- [ ] `lib/supabase/database.types.ts` exists, starts with the GENERATED
      header, and contains all 15 public tables.
- [ ] `grep -rn "LooseDB" lib app tests` returns nothing.
- [ ] `package.json` has `types:gen`; running it (with auth) reproduces the
      file modulo the hand-added header.
- [ ] The deliberate bad-column insert failed `tsc` during Step 6 and was
      removed (state this in the summary/commit message).
- [ ] `nvm use 20 && npm run lint && npm run build` pass;
      `npm run test:monitor && npm run test:stack && npm run test:admin` all pass.
- [ ] `/`, `/deals`, `/cards`, `/admin/dashboard` render identically in dev.
- [ ] `git diff` contains only: the new generated file, the `types:gen`
      script, generic-parameter swaps, `PublicTable` typing, `Json` casts,
      optional eslint-ignore and test-fake casts — no logic, query, or copy
      changes anywhere.
