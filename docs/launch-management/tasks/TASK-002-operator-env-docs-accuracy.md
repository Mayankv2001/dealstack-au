# TASK-002: Operator env docs accuracy (README + .env.example)

## Status

READY

## Manager

Fable 5

## Recommended worker

Claude Haiku — documentation-only, mechanical, precisely specified. No code changes.

## Severity

Medium (the `ADMIN_EMAILS` description is a security-adjacent documentation error: an operator could believe admin access is granted/revoked via an env var that the code never reads)

## Launch impact

Required (deploy-operator-facing correctness; reduces launch-day configuration mistakes)

## Problem

Two operator-facing documents disagree with the code about environment variables:

1. **`README.md` "Required Vercel environment variables" table omits `NEXT_PUBLIC_SITE_URL`**, which `FINAL-LAUNCH-CHECKLIST.md` §1 correctly calls launch-critical: when unset, sitemap, robots, canonical URLs, OG image URLs and JSON-LD all silently fall back to `http://localhost:3000`. The same table lists `OZB_MONITOR_ENABLED` as if required — it is optional (only needed to activate feed monitoring, and the safe default is off).
2. **`.env.example` describes `ADMIN_EMAILS` as "Admin allowlist for Supabase Auth"** — but no code reads `ADMIN_EMAILS` (grep across `app/`, `lib/`, `scripts/`, `components/`, `proxy.ts` on 2026-07-10: zero matches). Admin access is governed solely by the `admins` database table checked by `requireAdmin()` (`lib/admin/auth.ts`), plus a hand-created Supabase Auth user (magic-link uses `shouldCreateUser: false`). An operator following `.env.example` could wrongly conclude that setting the var grants access or that removing an email revokes it.
3. `.env.example` files `NEXT_PUBLIC_SITE_URL` under "Optional (used in later phases)" — stale; it is required in production for correct SEO/canonical output.

## Evidence

- `grep -rn "ADMIN_EMAILS" app/ lib/ scripts/ components/ proxy.ts` → no matches (run 2026-07-10, commit `1fae4ed`).
- `lib/env.ts` `siteUrl()`: falls back to `http://localhost:3000` when `NEXT_PUBLIC_SITE_URL` is unset — consumed by `app/robots.ts`, `app/sitemap.ts`, metadata and JSON-LD.
- `lib/admin/auth.ts` `getAdminSession()`: allowlist is `.from("admins")` — the only admin authorisation source.
- `README.md` table (### Required Vercel environment variables) lists: SUPABASE URL / ANON KEY / SERVICE ROLE KEY / CRON_SECRET / OZB_MONITOR_ENABLED. No `NEXT_PUBLIC_SITE_URL`.
- `.env.example` lines ~13–16: `# Optional (used in later phases)` … `# ADMIN_EMAILS=you@example.com` … `# NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
- `FINAL-LAUNCH-CHECKLIST.md` §1 already documents both facts correctly — this task aligns the other two files with it.

## Desired outcome

An operator configuring Vercel from `README.md` or `.env.example` alone sets every launch-critical variable and cannot be misled into believing `ADMIN_EMAILS` controls admin access.

## Scope

Allowed to modify:

- `README.md` — the "Required Vercel environment variables" table/section only.
- `.env.example` — the `ADMIN_EMAILS` lines and the placement/annotation of `NEXT_PUBLIC_SITE_URL` only.

## Out of scope

- No code changes of any kind (this task must not "implement" `ADMIN_EMAILS` support).
- No changes to `FINAL-LAUNCH-CHECKLIST.md`, `PROJECT_STATE.md`, `docs/`, or any other file.
- No reformatting/rewriting of unrelated README sections.
- Do not add new env vars or invent behaviour the code does not have.

## Implementation requirements

1. `README.md`: add `NEXT_PUBLIC_SITE_URL` to the required-variables table with a one-line purpose noting it is launch-critical for sitemap/robots/canonical/OG/JSON-LD (falls back to localhost when unset). Mark `OZB_MONITOR_ENABLED` as optional — e.g. move it to a clearly-labelled optional row or annotate it "(optional — only to activate feed monitoring; default off)". Keep the table format.
2. `.env.example`: replace the two `ADMIN_EMAILS` lines (comment + example) with a short accurate note: admin access is governed solely by the `admins` table in Supabase plus a hand-created Auth user — there is no env-var allowlist. Do not keep the variable name as a suggested setting.
3. `.env.example`: move `NEXT_PUBLIC_SITE_URL` out of the "Optional" grouping (or re-label it), annotating it as required in production with the same one-line reason as the README row.
4. Australian spelling in any prose you write. Keep the existing terse comment style of both files.

## Security and trust boundaries

- Documentation must describe the real authorisation model (DB `admins` table) and must not suggest env-based access control exists.
- Do not include any real values, project refs, or secrets in either file.

## Acceptance criteria

1. `README.md` required-env section includes `NEXT_PUBLIC_SITE_URL` with a launch-critical annotation, and `OZB_MONITOR_ENABLED` is visibly optional.
2. `grep -n "ADMIN_EMAILS" .env.example` returns no suggested-variable line (the name may appear only inside an explanatory "there is no env allowlist" note, or not at all).
3. `.env.example` presents `NEXT_PUBLIC_SITE_URL` as required in production.
4. `git status` shows exactly two modified files: `README.md`, `.env.example`.
5. `npm run lint` and `npm run build` still pass (proves no stray code edits).

## Required tests

None — documentation-only. State this explicitly in the completion report. Do not add tests.

## Verification commands

```bash
nvm use 20
grep -n "NEXT_PUBLIC_SITE_URL\|ADMIN_EMAILS\|OZB_MONITOR_ENABLED" README.md .env.example
npm run lint
npm run build
git status
git diff --stat
```

## Documentation updates

This task IS the documentation update. No other docs change.

## Worker completion report

Return, in order:

1. Concise implementation summary.
2. Files changed.
3. Tests added or updated (expected: none — state this explicitly).
4. Exact verification commands run and their results.
5. Unresolved concerns.
6. Commit hash, if committed.
7. Confirmation that no files outside Scope were modified (`git status` output).

## Manager review checklist

- [ ] README table renders correctly (markdown table intact) and the new row's claim matches `lib/env.ts` behaviour.
- [ ] `.env.example` no longer suggests setting `ADMIN_EMAILS`; replacement note names the `admins` table AND the hand-created Auth user requirement.
- [ ] No behavioural claims were invented; wording consistent with `FINAL-LAUNCH-CHECKLIST.md` §1.
- [ ] Diff limited to the two files; no code touched.

## Rollback considerations

Docs-only: plain `git revert` restores prior text. No runtime effect.

## Dependencies

- Predecessors: none.
- Successors: none (but complete before final launch-day env verification, which reads these docs).
- Parallel-safe with TASK-001 and TASK-003 (zero file overlap) when on separate branches/worktrees.
