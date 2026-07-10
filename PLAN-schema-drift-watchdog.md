# PLAN-schema-drift-watchdog - Detect production schema drift automatically

> **Rank: 5 of 5.** Revalidated against `main` at `f65c951`. Production has a
> documented history of hand-applied migration drift; migration 005 was missing
> until a manual check found it. `npm run verify:schema` is read-only and useful,
> but it runs only when someone remembers and its manifest says "001-007"
> throughout. A future migration can be added without updating the probe, making
> a scheduled green check falsely reassuring unless manifest coverage is itself
> tested.

## Goal

Run the read-only production schema probe weekly and on explicit manual dispatch
from `main`, using GitHub Actions secrets isolated from ordinary PR CI. Make the
probe manifest self-auditing: adding a migration file without registering its
expected tables/columns must fail `test:admin` before merge.

This watchdog reports drift; it never applies migrations or writes to Supabase.

## Exact Files To Touch

| File | Required change |
|---|---|
| `scripts/schema-manifest.ts` | New pure manifest module: expected columns with per-column migration ownership, table creation ownership, and covered migration filenames |
| `scripts/verify-schema.ts` | Import the manifest and remove hard-coded `001-007` wording |
| `tests/admin/schemaManifest.test.ts` | Ensure every committed migration is represented and every manifest table has an owner |
| `.github/workflows/schema-drift.yml` | New weekly/manual production probe, restricted to `main` with minimal permissions |
| `FINAL-LAUNCH-CHECKLIST.md` | Document weekly history, manual dispatch, and secret setup |
| `docs/production-readiness.md` | Add watchdog setup, interpretation, rotation, and recovery steps |
| `PROJECT_STATE.md` | Record automated drift detection and current migration coverage |

Human setup outside Git: create GitHub Actions secrets
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Do not place either
value in a file, workflow output, issue, plan, or commit.

## Implementation Order

1. Replace `EXPECTED` and the too-coarse `TABLE_TO_MIGRATION` in
   `scripts/verify-schema.ts` with `scripts/schema-manifest.ts`. Export:

   ```ts
   export interface ExpectedTable {
     introducedBy: string;
     columns: Record<string, string>; // column name -> introducing migration
   }
   export const EXPECTED_SCHEMA: Record<string, ExpectedTable>;
   export const COVERED_MIGRATIONS: readonly string[];
   export function findManifestCoverageErrors(
     migrationFiles: readonly string[]
   ): string[];
   ```

   `COVERED_MIGRATIONS` must list every current SQL filename in
   `supabase/migrations` (`001_initial_schema.sql` through
   `007_card_offers.sql`). The pure validator reports:

   - committed migration missing from `COVERED_MIGRATIONS`;
   - covered filename absent from disk input;
   - schema table without an `introducedBy` owner;
   - table/column owner filename not in `COVERED_MIGRATIONS`;
   - empty or duplicate column names.

   Most columns use their table's creation migration. Extensions must point to
   the file that actually added them: `feed_sources.source_type` -> 004 and
   `feed_items.hidden_from_homepage` -> 005. This is what makes a drift report
   actionable instead of telling the operator to reapply migration 002.

2. Keep `verify-schema.ts` executable as before, but import the manifest. Derive
   its banner and success message from the covered filenames/table count instead
   of embedding `001-007`. Do not export or import the script's `main()` from
   tests: it reads env and exits the process.

3. Add `tests/admin/schemaManifest.test.ts`:

   - read `supabase/migrations` with `node:fs`;
   - keep only `*.sql`, sorted;
   - expect `findManifestCoverageErrors(files)` to equal `[]`;
   - unit-test the pure validator with a fake unregistered `008_example.sql`;
   - unit-test stale covered filenames and missing table/column ownership;
   - assert the two post-creation columns above report migrations 004 and 005.

   This does not parse SQL. Its purpose is to force the next migration author to
   update the explicit column manifest in the same PR, where reviewers can check
   the declared columns against the SQL.

4. Create `.github/workflows/schema-drift.yml`:

   ```yaml
   name: Schema drift

   on:
     schedule:
       - cron: "0 21 * * 1"
     workflow_dispatch:

   permissions:
     contents: read

   concurrency:
     group: schema-drift-production
     cancel-in-progress: false

   jobs:
     verify:
       if: github.ref == 'refs/heads/main'
       runs-on: ubuntu-latest
       timeout-minutes: 10
       env:
         NEXT_TELEMETRY_DISABLED: "1"
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: .nvmrc
             cache: npm
         - run: npm ci
         - name: Probe production schema
           env:
             NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
             SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
           run: npm run verify:schema
   ```

   Keep secrets scoped to the final probe step so dependency installation and
   lifecycle scripts cannot read them. Keep this separate from `ci.yml`.

5. In GitHub, create the two repository Actions secrets. The service-role key is
   required because staging/admin tables have no anon read policy. Record the
   operational tradeoff in `docs/production-readiness.md`: rotating the key now
   requires updating Supabase consumers in Vercel, local secrets, and GitHub.

6. Merge the workflow to `main`, then use Actions -> Schema drift -> Run
   workflow. A run selected on any non-main ref must skip the job. Interpret
   outcomes strictly:

   - exit 0: all registered tables/columns exist;
   - exit 1: drift found; review/apply the named migration manually, then rerun;
   - exit 2: watchdog blind (configuration, auth, connectivity, or unexpected
     API error); investigate, never mark green with `continue-on-error`.

7. Test alert delivery through normal GitHub Actions notifications. Ensure the
   repository owner watches failed workflow runs; scheduled workflows are not a
   pager if nobody receives the failure notification.

8. Run the local Node 20 gate:

   ```bash
   npm run lint
   npm run test:admin
   npm run test:monitor
   npm run test:stack
   npm run build
   git diff --check
   ```

   Also verify:

   ```bash
   rg 'pull_request|push:' .github/workflows/schema-drift.yml
   rg 'secrets\.' .github/workflows/ci.yml
   ```

   Both commands must produce no matches.

## Edge Cases A Weaker Model Would Miss

1. **Automating an incomplete manifest can create false confidence.** The
   migration-directory test is part of this plan, not optional polish.
2. **Do not run production-secret workflows on PRs or pushes.** PR code can
   modify scripts; ordinary CI must remain secretless and safe for untrusted
   branches.
3. **Manual dispatch can target a branch.** The job-level main-ref condition
   prevents a selected feature branch from executing modified code with
   production secrets.
4. **Step-level secret scoping matters.** Job-level secrets would be available to
   `npm ci` and package lifecycle hooks. Expose them only to the probe command.
5. **The service-role key is intentionally powerful.** It is needed for private
   tables, must be masked by Actions, and must never be printed. This is a human
   consent/setup step, not something an agent should infer or retrieve.
6. **A blind watchdog is a failure.** Missing secrets, Supabase downtime, and
   unknown errors must stay red; never add `continue-on-error` or `|| true`.
7. **No auto-migration.** Applying SQL from a scheduled workflow violates the
   repository's reviewed-migration rule and turns a detector into a destructive
   actor.
8. **Column presence is not full schema equivalence.** The current PostgREST
   probe cannot verify indexes, constraints, triggers, functions, or RLS policy
   text. State this residual risk; do not claim a green run proves total schema
   identity.
9. **Scheduled workflows run only from the default branch and may be disabled
   after long inactivity.** Keep manual pre-launch verification in the checklist
   and inspect Actions history during release review.
10. **Migration ownership spans files.** A table created in 002 and extended in
    004/005 must report the migration containing the missing column. Per-column
    ownership is mandatory; retaining one `TABLE_TO_MIGRATION` value would
    incorrectly tell the operator to reapply migration 002.
11. **Do not load `.env.local` in Actions.** The script already tolerates its
    absence and reads the step environment.
12. **Never test secret masking by echoing the real key.** Inspect normal logs
    and use a disposable fake variable if masking behaviour itself must be
    demonstrated.

## Acceptance Criteria

- [ ] Adding an unregistered `008_*.sql` migration makes `test:admin` fail with
      an explicit manifest-coverage error.
- [ ] Workflow triggers are exactly weekly schedule plus manual dispatch; the
      job cannot run off `main`.
- [ ] Existing `.github/workflows/ci.yml` is unchanged and contains no secret
      references.
- [ ] Supabase secrets are scoped only to the probe step and never appear in
      logs.
- [ ] Manual dispatch on `main` returns green, or accurately identifies drift
      that is manually repaired before a green rerun.
- [ ] Missing-secret and connection-failure tests/runs remain red (exit 2).
- [ ] Documentation states the probe's table/column-only limitation and key
      rotation responsibilities.
- [ ] Full Node 20 quality gate and `git diff --check` pass.
