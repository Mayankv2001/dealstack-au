# PLAN-ci-quality-gates — Make the commit checklist structural, not ritual

> **Rank: 1 of 5 (2026-07-10 follow-on backlog — do this first).** This repo
> has **no CI at all** — no `.github/` directory exists (verified against
> `origin/main` @ `4217595`). The entire quality gate (lint, build, three
> Vitest suites, smoke) lives in CLAUDE.md's commit checklist and depends on
> every human and agent remembering to run it. The git workflow is
> deliberately autonomous — **two Claude accounts push straight to `main`**
> (PROJECT_STATE §10) — and on 2026-07-10 that risk stopped being
> theoretical: two parallel sessions each produced a "2026-07-10 backlog"
> with overlapping plans (two different `PLAN-detection-go-live.md` bodies,
> two `dq-mark-rechecked` refreshes) and raced work toward `main`. A
> required PR check is the structural fix. This plan adds a single GitHub
> Actions workflow that runs the full gate on every PR and every push to
> main — **with zero repository secrets**, because the codebase's own
> static-fallback design means lint, tests, build and smoke all pass without
> Supabase env (verified 2026-07-10: `eslint` clean, all three suites green
> — 340 tests at verification time, more have landed since — and
> `npm run build` green with no `.env` present). Ranked first because it
> protects every other plan in this batch.

## Prerequisites

- No local Node version gymnastics needed — the workflow reads `.nvmrc`
  (currently `20`).
- Read before writing YAML:
  - `package.json` — the exact script names you will call (`lint`,
    `test:monitor`, `test:stack`, `test:admin`, `build`, `start`, `smoke`).
  - `scripts/smoke-routes.ts` — top comment + the `isLocal` handling (:47,
    :176-196): host/localhost-leak assertions are **skipped for localhost
    base URLs**, and HSTS absence is a warn not a fail, so smoke passes in
    CI without `NEXT_PUBLIC_SITE_URL`.
  - `lib/supabase/server.ts` + `lib/env.ts` (`hasSupabaseEnv`) — why no
    secrets are needed: with Supabase env absent, every public read serves
    the static/demo data, and ISR prerendering at build time uses it.

## Goal

Every pull request and every push to `main` runs one workflow that fails
loudly if any of these fail: ESLint, `test:monitor`, `test:stack`,
`test:admin`, production build, and the route/SEO/security-header smoke test
against a locally started production build. No secrets are configured or
referenced. The check is visible on PRs so a red X blocks careless merges.

## Exact files to touch

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | **New** — the only code change in this plan |
| `PROJECT_STATE.md` | §4 Completed Work + §11 Latest Changes entries |
| `FINAL-LAUNCH-CHECKLIST.md` | One line under the pre-commit gate: CI now runs the same gate on every PR/push |

No app code, no config, no test changes. `vercel.json` untouched.

## Step-by-step implementation order

### Step 1 — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test:monitor
      - run: npm run test:stack
      - run: npm run test:admin
      - run: npm run build
      - name: Smoke test the production build
        run: |
          npm run start &
          for i in $(seq 1 30); do
            curl -sf -o /dev/null http://localhost:3000 && break
            sleep 2
          done
          npm run smoke
```

### Step 2 — docs

- `PROJECT_STATE.md`: add the CI workflow to §4 (with commit hash once
  committed) and §11.
- `FINAL-LAUNCH-CHECKLIST.md`: under the "Pre-commit gate" section, add one
  sentence that the same gate runs automatically in GitHub Actions on every
  PR and push to main (local runs remain the fast path).

### Step 3 — verify

1. Commit on a branch, push, open a PR. Confirm the "CI / quality" check
   appears and every step is green.
2. Confirm the workflow file contains no `secrets.` reference at all:
   `grep -c "secrets\." .github/workflows/ci.yml` → `0`.
3. (Optional but recommended) On a scratch branch, deliberately break one
   assertion in `tests/stack/calculateStack.test.ts`, push, and confirm the
   check goes red; delete the scratch branch after.

### Step 4 — human follow-up (dashboard, not code)

Suggest to the owner (do not attempt from code): GitHub → Settings →
Branches → protect `main` with "Require status checks to pass" using this
check. Given the 2026-07-10 two-session collision, also worth suggesting
the two accounts adopt branch + PR flow rather than direct pushes to main —
but that is the owner's call, not this plan's.

## Edge cases a weaker model would miss

1. **Do NOT add Supabase secrets to make CI "more real".** Secretless CI is
   a feature: the repos detect missing env (`hasSupabaseEnv()`) and serve
   static/demo data, so build prerendering and smoke both work. Adding
   secrets would make CI hit the production database on every PR — slower,
   flakier, and a leak surface. If `PLAN-live-data-trust.md` ships, it only
   changes *configured* behaviour; env-absent demo mode stays, so this CI
   stays valid. (The scheduled drift watchdog in
   `PLAN-schema-drift-watchdog.md` is the deliberate, separate exception —
   never merge the two workflows.)
2. **`npm run smoke` must run in the same job as `npm run build`** — it
   needs the `.next` output on disk for `npm run start`. Splitting build
   and smoke into separate jobs without artifact upload is the classic
   failure here.
3. **Smoke's sitemap/host assertions are localhost-aware.** Do not set
   `NEXT_PUBLIC_SITE_URL` in CI to "fix" the sitemap checks — they are
   intentionally skipped when the base URL is localhost (`isLocal`), and
   setting a fake prod URL would make the "Sitemap line contains host"
   check fail.
4. **Node version comes from `.nvmrc`, not a hardcoded number.** The repo's
   known local quirk (shell defaulting to old Node, `nvm use 20`) does not
   exist in CI, but hardcoding `20` in YAML would silently diverge the day
   `.nvmrc` moves to 22. `node-version-file: .nvmrc` keeps one source of
   truth. (`engines` in package.json is `>=20`, so Node 22 also works —
   verified locally.)
5. **The readiness loop before smoke is required.** `next start` accepts
   connections a moment after spawn but the first render can be slow;
   `smoke` has a 15s per-request timeout and only retries network errors
   once. 30 × 2s of `curl -sf` polling makes the start deterministic.
   Don't replace it with a bare `sleep 5`.
6. **The Turbopack panic noted in PROJECT_STATE §10 is a dev-server issue**
   (`next dev` workers) — it does not affect `next build` in CI. Do not
   add `rm -rf .next/dev` steps or Node PATH prefixes; they're local-only
   workarounds.
7. **`push:` is filtered to `main` while `pull_request:` is unfiltered** —
   otherwise every push to a PR branch runs the workflow twice (once as
   push, once as PR synchronize). Keep the asymmetry.
8. **Vitest suites are offline by design** (pure functions, `vi.mock`ed
   Supabase/network) — if a test suddenly needs env in CI, that's a real
   regression in test hygiene, not something to fix by adding CI env vars.
9. **`workflow_dispatch` is included on purpose** so the owner can re-run
   the gate on main without an empty commit.
10. **Don't add `npm run verify:schema` to this workflow.** It probes the
    live Supabase project and needs the service-role key — exactly what
    this workflow promises never to hold. Scheduled drift checking is its
    own plan (`PLAN-schema-drift-watchdog.md`) with its own security
    framing.

## Acceptance criteria

- [ ] `.github/workflows/ci.yml` exists and is the only non-docs change
      (`git diff --stat` shows it plus the two `.md` files).
- [ ] The PR for this change shows the CI check running all seven steps
      (lint, 3 test suites, build, start+smoke) and finishing green in
      under ~10 minutes.
- [ ] `grep -c "secrets\." .github/workflows/ci.yml` returns 0; the
      workflow never references Supabase URLs/keys or `CRON_SECRET`.
- [ ] A deliberately broken test on a scratch branch turns the check red
      (then clean up the branch).
- [ ] Local gate still green before commit: `npm run lint`,
      `npm run build`, `npm run test:monitor`, `npm run test:stack`,
      `npm run test:admin` (docs-only files can't break them, but run the
      ritual — it is the thing this plan automates, not deletes).
