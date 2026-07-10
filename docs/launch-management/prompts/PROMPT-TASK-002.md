# Worker prompt — TASK-002 (Operator env docs accuracy)

You are a coding worker on the DealStack AU repository. You will implement exactly one documentation task, defined in a task file. You are not the manager; do not re-plan the backlog or start any other task.

## Before you write anything

1. Read `docs/launch-management/tasks/TASK-002-operator-env-docs-accuracy.md` in full. It is the specification. If anything below conflicts with it, the task file wins.
2. Read the repository instructions: `CLAUDE.md` and `AGENTS.md`. Relevant hard rules: never commit or log real env values; Australian spelling in prose; keep changes small.
3. Inspect before editing — verify the evidence yourself:
   - `grep -rn "ADMIN_EMAILS" app/ lib/ scripts/ components/ proxy.ts` → must return nothing (the variable is unused by code).
   - `lib/env.ts` → `siteUrl()` falls back to `http://localhost:3000` when `NEXT_PUBLIC_SITE_URL` is unset.
   - `lib/admin/auth.ts` → admin access = Supabase Auth session + row in the `admins` table. Nothing else.
   - `FINAL-LAUNCH-CHECKLIST.md` §1 → the wording your changes must stay consistent with.
   - The current `README.md` required-env table and the current `.env.example` "Optional" block.
4. Run `git status` and confirm the working tree is clean. If not, STOP and report.

## Task assumptions — verify, then proceed

If your grep DOES find code reading `ADMIN_EMAILS`, the task premise is false: STOP and report the file/line instead of editing anything.

## Implement (only this)

1. `README.md` — in the "Required Vercel environment variables" section only:
   - Add a `NEXT_PUBLIC_SITE_URL` row: launch-critical; sitemap, robots, canonical, OG image URLs and JSON-LD fall back to `http://localhost:3000` when unset.
   - Make `OZB_MONITOR_ENABLED` visibly optional (annotate "(optional — only to activate feed monitoring; default off)" or move it under a clearly-labelled optional list). Keep the table valid markdown.
2. `.env.example` — two changes only:
   - Remove the `ADMIN_EMAILS` suggestion (both comment lines). Replace with a short note: admin access is governed solely by the `admins` table in Supabase plus a hand-created Auth user — there is no env-var allowlist.
   - Present `NEXT_PUBLIC_SITE_URL` as required in production (move it out of, or re-label, the "Optional" grouping) with the same one-line reason.

Do NOT: change any code file, change other README sections, change `FINAL-LAUNCH-CHECKLIST.md` or anything in `docs/`, invent behaviour, or add real values.

## Verify (all must pass; run exactly these)

```bash
nvm use 20
grep -n "NEXT_PUBLIC_SITE_URL\|ADMIN_EMAILS\|OZB_MONITOR_ENABLED" README.md .env.example
npm run lint
npm run build
git status
git diff --stat
```

`git diff --stat` must list exactly two files: `README.md` and `.env.example`. If any command fails, fix within scope or report honestly. Never claim success for a command that failed.

## Before reporting

Review your own diff (`git diff`). Check the README table still renders (pipe alignment), spelling is Australian, and no claim exceeds what the code does.

## Completion report (required format)

1. Implementation summary.
2. Files changed.
3. Tests added/updated (expected: none — say so explicitly).
4. Exact verification commands and results.
5. Unresolved concerns.
6. Commit hash if you committed (suggestion: `Docs: correct required env table and remove unused ADMIN_EMAILS from .env.example`).
7. Confirmation that no files outside scope were modified, with `git status` output.
