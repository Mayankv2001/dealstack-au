# Worker prompt — TASK-001 (Migration 008: pin `set_updated_at()` search_path)

You are a coding worker on the DealStack AU repository. You will implement exactly one task, defined in a task file. You are not the manager; do not re-plan the backlog or start any other task.

## Before you write anything

1. Read `docs/launch-management/tasks/TASK-001-pin-set-updated-at-search-path.md` in full. It is the specification. If anything below conflicts with it, the task file wins.
2. Read the repository instructions: `CLAUDE.md` and `AGENTS.md`. Hard rules that apply to this task: migrations must be reviewed before applying to production (you will NOT apply anything to any database); do not change RLS or security policies; keep changes small.
3. Inspect the current implementation before editing:
   - `supabase/migrations/001_initial_schema.sql` — find `create or replace function set_updated_at()` and confirm its body references only `new.updated_at` and `now()`.
   - `scripts/schema-manifest.ts` — find `COVERED_MIGRATIONS` and read the file-header comment explaining the registration rule.
   - `tests/admin/schemaManifest.test.ts` — understand the self-audit you must satisfy.
4. Run `git status` and confirm the working tree is clean and you are on the expected branch. If it is not clean, STOP and report — do not build on top of unrelated changes.

## Task assumptions — verify, then proceed

- The advisor finding is `function_search_path_mutable` on `public.set_updated_at`.
- A migration file registered in `COVERED_MIGRATIONS` needs no `EXPECTED_SCHEMA` entry when it adds no tables/columns.

If either assumption turns out to be false in the code you inspect, STOP and report what you found with file/line evidence instead of improvising.

## Implement (only this)

1. New file `supabase/migrations/008_pin_function_search_path.sql`: a single `alter function public.set_updated_at() set search_path = '';` plus a brief comment block in the style of the existing migrations (why: Supabase linter 0011; why `''` is safe: the body only uses `now()`, which resolves from `pg_catalog`; note it is safely re-runnable).
2. Append `"008_pin_function_search_path.sql"` to `COVERED_MIGRATIONS` in `scripts/schema-manifest.ts`. Touch nothing else in that file.
3. Update `FINAL-LAUNCH-CHECKLIST.md` §3 and the migrations table in `docs/production-readiness.md` to include 008.

Do NOT: apply the migration anywhere, modify migrations 001–007, touch `EXPECTED_SCHEMA`, `scripts/verify-schema.ts`, workflows, tests, or application code.

## Verify (all must pass; run exactly these)

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

If any command fails, fix the cause within scope or report the failure honestly. Never claim success for a command that failed, and never weaken a test to get green.

## Before reporting

Review your own diff end-to-end (`git diff`). Confirm: only the four allowed files changed; the migration contains exactly one ALTER FUNCTION statement; no unrelated modifications.

## Completion report (required format)

1. Implementation summary (a few sentences).
2. Files changed.
3. Tests added/updated (expected: none — say so explicitly).
4. Exact verification commands and results (paste output tails, including test counts).
5. Unresolved concerns.
6. Commit hash if you committed (commit message suggestion: `Add migration 008: pin set_updated_at search_path (advisor 0011)`).
7. Confirmation that no files outside scope were modified, with `git status` output.
