# PLAN-schema-drift-watchdog — Run verify:schema on a schedule, not on memory

> **Rank: 4 of 5 (2026-07-10 follow-on backlog).** Prod schema drift is not
> hypothetical here: migrations were historically hand-applied, and on
> 2026-07-08 migration 005 (`feed_items.hidden_from_homepage`) was found
> **not applied to production** (PROJECT_STATE §10 — "verify prod schema
> via `information_schema.columns`, not just table existence"). The repo
> already owns the cure — `npm run verify:schema` (`scripts/verify-schema.ts`,
> shipped `49086d0`) probes the live project for every table/column
> migrations 001-007 declare, exits 1 on drift, 2 on config error, and
> FINAL-LAUNCH-CHECKLIST §3 tells the operator to run it — but it only runs
> when a human remembers, which is exactly how 005 slipped. This plan adds
> a **scheduled GitHub Actions workflow** (weekly + manual dispatch, never
> on PRs) that runs the probe against production using repo secrets, so
> drift becomes a red workflow run and a notification email instead of a
> latent prod bug. It is deliberately a separate workflow from
> `PLAN-ci-quality-gates.md`'s `ci.yml`, whose zero-secrets property must
> survive.

## Prerequisites

- `PLAN-ci-quality-gates.md` is NOT required first (independent files), but
  if both land, keep them as two workflows — never merge (edge case 1).
- Read fully before writing YAML:
  - `scripts/verify-schema.ts` — header (:1-40): required env
    (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`), why the
    service-role key is needed (staging tables have no anon SELECT policy;
    the anon key would misreport RLS denials as drift), and the exit-code
    contract (0 match / 1 drift / 2 config error).
  - The script's `.env.local` loader — it is wrapped in try/catch for
    standalone runs, so a missing `.env.local` in CI is fine; env comes
    from `process.env` (i.e. the workflow's `env:` block).
  - `.nvmrc` (Node 20) and `package.json` scripts.

## Goal

A workflow named "Schema drift" runs every Monday and on manual dispatch,
executes `npm run verify:schema` against the production Supabase project
using two repository secrets, and fails red (email/notification to the
owner via normal GitHub notifications) whenever the live schema is missing
anything migrations 001-007 declare — or whenever the check itself cannot
run (missing secret, unreachable project), because a blind watchdog must
also alarm.

## Exact files to touch

| File | Change |
|---|---|
| `.github/workflows/schema-drift.yml` | **New** — the only code change |
| `FINAL-LAUNCH-CHECKLIST.md` | §3: note the check now also runs weekly in CI (manual run remains the pre-launch step) |
| `PROJECT_STATE.md` | §4/§11 entries |

Plus one **human dashboard step** (not a file): create the two repository
secrets (Step 2).

## Step-by-step implementation order

### Step 1 — `.github/workflows/schema-drift.yml`

```yaml
name: Schema drift

on:
  schedule:
    - cron: "0 21 * * 1" # Mondays 21:00 UTC (~Tue 07:00 AEST)
  workflow_dispatch:

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - name: Probe production schema against migrations 001-007
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run verify:schema
```

### Step 2 — repository secrets (human, GitHub dashboard)

GitHub → repo → Settings → Secrets and variables → Actions → New
repository secret, twice:
- `NEXT_PUBLIC_SUPABASE_URL` — the project URL (same value as Vercel's).
- `SUPABASE_SERVICE_ROLE_KEY` — the service-role key (same value as
  Vercel's server-only var).

Document in the PR description that these must exist before the first
dispatch, and that the workflow simply fails with exit 2 until they do —
which is correct behaviour, not a bug.

### Step 3 — docs

- `FINAL-LAUNCH-CHECKLIST.md` §3: after the existing
  `npm run verify:schema` sentence, add: "This probe also runs weekly via
  `.github/workflows/schema-drift.yml` (Actions tab → 'Schema drift' for
  history and manual re-runs)."
- `PROJECT_STATE.md`: §4 entry with commit hash; §11 latest-changes line.

### Step 4 — verify

1. Push the branch, merge to main (scheduled workflows only fire from the
   default branch — see edge case 4), then Actions tab → "Schema drift" →
   **Run workflow** (manual dispatch).
2. Expected outcomes, both acceptable:
   - **Green** — prod matches migrations 001-007.
   - **Red with exit 1 and a drift report** — the watchdog just did its
     job on day one; apply the named migration, re-dispatch, confirm green.
3. Local gate (docs + YAML only, but run the ritual): `nvm use 20`,
   `npm run lint`, `npm run build`.

## Edge cases a weaker model would miss

1. **Never add `pull_request`/`push` triggers, and never merge this into
   `ci.yml`.** The whole design of `ci.yml`
   (`PLAN-ci-quality-gates.md` edge case 1) is that it holds zero secrets
   and can safely run on any PR. This workflow holds the service-role key;
   restricting it to `schedule` + `workflow_dispatch` means it only ever
   runs from the default branch's committed YAML, with no PR-injected code
   deciding what to do with the secret.
2. **The service-role key in Actions secrets is a deliberate, consented
   tradeoff — surface it, don't smuggle it.** CLAUDE.md forbids exposing
   the key to client code or public routes; an Actions secret is
   server-side, masked in logs, and unavailable to fork PRs — standard
   practice — but the PR description must say the key is being added to a
   second secret store so the owner can consent (and knows to rotate it in
   Supabase → update both Vercel and GitHub if it ever leaks). If the
   owner declines, close the PR — this plan is optional infrastructure.
3. **Exit code 2 (config error) must fail the job, and does.** Missing
   secrets, an unreachable project, or an unrecognised API error make the
   watchdog blind; a blind watchdog that reports green is worse than none.
   `verify-schema.ts` already exits non-zero for these — do not wrap the
   step in `continue-on-error` or `|| true`.
4. **Scheduled workflows only run from the default branch.** The YAML must
   be merged to `main` before the Monday schedule ever fires; until then,
   only `workflow_dispatch` works (and dispatch also requires the file on
   the branch you dispatch from). Test via dispatch post-merge; don't
   conclude "schedule is broken" from a feature branch.
5. **GitHub auto-disables schedules after ~60 days without repo activity.**
   This repo is active so it's unlikely, but note it in the checklist line
   so a future quiet period doesn't silently kill the watchdog (GitHub
   emails a warning first, and the Actions tab shows "disabled").
6. **The script's `.env.local` loader is CI-safe.** It loads the file only
   if present (try/catch); in Actions the env comes from the step's `env:`
   block. Do not create a fake `.env.local` in the workflow, and never
   `echo` the secrets anywhere (they're masked, but don't rely on it).
7. **Secret names must match `lib/env.ts` exactly**
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) — the script
   reads them via `supabaseUrl()`/`supabaseServiceRoleKey()`, which throw
   with a helpful message naming the variable if absent (that message is
   what a red exit-2 run shows).
8. **The probe is read-only by design** — it queries
   `information_schema`-level metadata via the REST API and writes
   nothing. Don't "improve" it to auto-apply missing migrations from CI;
   migrations are reviewed before prod (CLAUDE.md Supabase rules), and an
   auto-applying watchdog would violate that.
9. **Notification path is GitHub's default** (failed-workflow email to
   whoever watches the repo). Don't build Slack/webhook plumbing here —
   the owner already gets failure emails; keep the diff one YAML file.

## Acceptance criteria

- [ ] `.github/workflows/schema-drift.yml` exists; triggers are exactly
      `schedule` + `workflow_dispatch`
      (`grep -E "pull_request|push:" .github/workflows/schema-drift.yml` →
      0 hits).
- [ ] `ci.yml` (if present) is unchanged and still secretless
      (`grep -c "secrets\." .github/workflows/ci.yml` → 0).
- [ ] Both secrets created (human-confirmed); a manual dispatch after merge
      completes **green**, or red-with-drift-report that names the missing
      migration (then: apply, re-dispatch, green).
- [ ] Removing a secret and dispatching produces a red run whose log shows
      the missing-variable message and exit code 2 (restore the secret
      after) — the blind-watchdog case alarms.
- [ ] No secret value appears in any workflow log (spot-check the run log).
- [ ] `FINAL-LAUNCH-CHECKLIST.md` §3 and `PROJECT_STATE.md` updated;
      `npm run lint` and `npm run build` green on Node 20.
