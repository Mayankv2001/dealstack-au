# TASK-001: Migration 008 — pin `set_updated_at()` search_path

## Status

READY

## Manager

Fable 5

## Recommended worker

Claude Sonnet — this touches a database migration, the schema-manifest self-audit, and Postgres function semantics. Too much correctness nuance for a mechanical worker; nowhere near needing a frontier model.

## Severity

Low

## Launch impact

Recommended (not a blocker — see Security and trust boundaries for why exploitability is low)

## Problem

The Supabase security advisor reports a WARN-level finding on the production database:

> Function `public.set_updated_at` has a role mutable search_path
> (lint `function_search_path_mutable`, remediation: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)

A function without a pinned `search_path` resolves unqualified identifiers using the calling role's search path. If any role that can trigger the function could also create objects in a schema earlier in that path, object resolution inside the function could be hijacked. Pinning the search path removes the entire class of issue and clears the only WARN-level database finding.

This is the sole code-side finding from the manager's 2026-07-10 production security-advisor sweep.

## Evidence

- Function definition: `supabase/migrations/001_initial_schema.sql`, `create or replace function set_updated_at()` (~line 18). Body is exactly `new.updated_at = now(); return new;` — the only function call is `now()`, which lives in `pg_catalog` and is always resolvable regardless of `search_path`, so pinning to `''` cannot break the function.
- The function is attached as a `BEFORE UPDATE` trigger to `stores`, `gift_card_offers`, `cashback_offers`, `points_offers`, `ozbargain_signals` (and later tables) — see the `-- ── updated_at triggers` section of migration 001 and later migrations.
- Advisor output captured 2026-07-10 against project `numgsivlrglflsnqehac` (read-only `get_advisors` call): one WARN for `public.set_updated_at`.
- Manifest self-audit contract: `scripts/schema-manifest.ts` — `findManifestCoverageErrors()` requires **every file in `supabase/migrations/` to be listed in `COVERED_MIGRATIONS`** (and vice-versa). A covered migration is **not** required to own any tables/columns, so a function-only migration needs only the `COVERED_MIGRATIONS` entry. Enforced by `tests/admin/schemaManifest.test.ts` via `npm run test:admin`.

## Desired outcome

A reviewed, committed migration `008` that pins `set_updated_at()`'s search path, registered in the schema manifest, with all test suites green. The migration is **not** applied to production by the worker — application is a separate human step after manager review (per CLAUDE.md: migrations must be reviewed before applying).

## Scope

Allowed to modify:

- `supabase/migrations/008_pin_function_search_path.sql` (new file)
- `scripts/schema-manifest.ts` (append the new filename to `COVERED_MIGRATIONS` only)
- `FINAL-LAUNCH-CHECKLIST.md` §3 (extend the migration list `001 … 007` with `008`)
- `docs/production-readiness.md` (the migrations table that currently ends at 007)

## Out of scope

- Do NOT apply anything to the production database.
- Do NOT modify migrations 001–007 (they are already applied to prod).
- Do NOT add tables, columns, RLS policies, triggers, or any other DDL beyond the single `ALTER FUNCTION`.
- Do NOT touch `EXPECTED_SCHEMA` in `scripts/schema-manifest.ts` (no schema shape changes).
- Do NOT modify `scripts/verify-schema.ts`, any workflow files, or any application code.

## Implementation requirements

1. Create `supabase/migrations/008_pin_function_search_path.sql` containing (comment style matching migrations 001–007):
   - `alter function public.set_updated_at() set search_path = '';`
   - A brief comment stating why (advisor lint `0011_function_search_path_mutable`) and why `''` is safe for this body (`now()` resolves from `pg_catalog`, which is always searched implicitly; the function references no other objects).
2. The statement must be safely re-runnable (plain `ALTER FUNCTION … SET` is — re-running just re-sets the same value; note this in the file comment like other migrations do).
3. Append `"008_pin_function_search_path.sql"` to `COVERED_MIGRATIONS` in `scripts/schema-manifest.ts`, keeping order.
4. Update the two documentation locations listed in Scope to mention 008.

## Security and trust boundaries

- This is defence-in-depth: the function is `SECURITY INVOKER` (default), anon/authenticated roles cannot create objects in `public` on this project, and all writes to the triggering tables go through the service role. That is why the severity is Low and launch impact Recommended, not Blocker.
- Nothing in this task may weaken RLS, touch policies, or change any table.
- The worker never needs (and must not use) production credentials.

## Acceptance criteria

Each independently verifiable:

1. `supabase/migrations/008_pin_function_search_path.sql` exists, contains exactly one `ALTER FUNCTION public.set_updated_at() SET search_path …` statement, and no other DDL.
2. `COVERED_MIGRATIONS` in `scripts/schema-manifest.ts` ends with the new filename; `EXPECTED_SCHEMA` is unchanged (`git diff` on that file shows only the one-line array addition).
3. `npm run test:admin` passes (manifest self-audit accepts the new migration).
4. `npm run test:monitor`, `npm run test:stack`, `npm run lint`, `npm run build` all pass.
5. `FINAL-LAUNCH-CHECKLIST.md` §3 and `docs/production-readiness.md` list migration 008.
6. `git status` shows only the files listed in Scope changed.

## Required tests

No new test files. The existing manifest self-audit (`tests/admin/schemaManifest.test.ts`) is the required coverage: it must pass **with** the new migration file present (criterion 3). Do not weaken or modify that test — if it fails, the fix is in `schema-manifest.ts`, not the test.

## Verification commands

```bash
nvm use 20
npm run lint
npm run test:admin
npm run test:monitor
npm run test:stack
npm run build
git status
git diff scripts/schema-manifest.ts
```

## Documentation updates

- `FINAL-LAUNCH-CHECKLIST.md` §3: extend the migration checklist line with `008 pin_function_search_path` and note it clears the Supabase advisor WARN.
- `docs/production-readiness.md`: add an 008 row to the migrations table.

## Worker completion report

Return, in order:

1. Concise implementation summary.
2. Files changed.
3. Tests added or updated (expected: none — state this explicitly).
4. Exact verification commands run and their results (paste tails, including test counts).
5. Unresolved concerns.
6. Commit hash, if committed.
7. Confirmation that no files outside Scope were modified (`git status` output).

## Manager review checklist

- [ ] Migration contains only the single ALTER FUNCTION statement; no schema shape change.
- [ ] `''` (or `pg_catalog`) pinning chosen and justified; function body verified to reference nothing schema-dependent.
- [ ] `COVERED_MIGRATIONS` change is one line; `EXPECTED_SCHEMA` untouched.
- [ ] Manifest self-audit passes against the real migrations directory (run `npm run test:admin` myself).
- [ ] Doc updates accurate; checklist wording keeps "review before applying to prod".
- [ ] After approval: schedule the human prod application (SQL editor, then re-run `get_advisors` to confirm the WARN clears, then run the schema-drift workflow dispatch).

## Rollback considerations

- Not applied to prod by this task, so repo revert is a plain `git revert`.
- If later applied to prod and anything misbehaves: `ALTER FUNCTION public.set_updated_at() RESET search_path;` restores the previous behaviour instantly. No data or shape change involved.

## Dependencies

- Predecessors: none.
- Successors: human prod application step (tracked under the launch decision, after manager review approves this task).
- Parallel-safe with TASK-002 and TASK-003 (zero file overlap) when on separate branches/worktrees.
