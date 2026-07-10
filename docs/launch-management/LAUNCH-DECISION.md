# DealStack AU — Launch Decision

> Maintained by the launch manager (Fable 5). "Ready" never means "the code compiles";
> it means every gate below has evidence.

## Current status: **CONDITIONALLY READY** (2026-07-10, commit `1fae4ed`)

The codebase, tests, security boundaries, CI, and the live production deployment are verified good (evidence below). The site is already deployed and serving trustworthy content at `https://dealstack-au.vercel.app` — strict-content smoke passed 28/28 against it today. What separates this from READY TO LAUNCH is a short list of **operational actions only a human can perform**, plus three small recommended repo tasks. No launch-blocking code defect is known.

## Gate evidence (verified 2026-07-10 by the manager)

| Gate | Status | Evidence |
|---|---|---|
| Lint | PASS | `npm run lint` clean (Node 20) |
| Type check | PASS | `next build` runs `tsc` type checking; build passed |
| Test suites | PASS | 203 monitor + 166 stack + 114 admin = 483/483 |
| Production build | PASS | `npm run build` succeeds |
| CI quality gate | CONFIGURED | `.github/workflows/ci.yml` runs lint/tests/build/smoke on every PR + push to main (run history not re-checked this session — `gh` unauthenticated; identical steps passed locally) |
| Production smoke | PASS | `npm run smoke -- --strict-content --base-url=https://dealstack-au.vercel.app` → 28/28: routes, 404s, admin redirects, endpoint auth, robots/sitemap/OG on prod host, security headers + HSTS, zero banned trust markers |
| Auth & admin controls | VERIFIED | Two-layer gate (`proxy.ts` optimistic + `requireAdmin()` against `admins` table via service role); magic-link with `shouldCreateUser:false`, no enumeration, throttled; callback has no open redirect; smoke confirms `/admin/*` 307→login unauthenticated |
| Publication / data-trust boundaries | VERIFIED | `fromDbOrDemo` fail-closed policy (configured DB never falls back to demo data); Top-Deals approved-signal boundary; card-offer readiness gate on read AND write paths; URL policy at write/read/render/egress; JSON-LD `<` escaping (tested); all covered by the green suites |
| Database (prod, read-only) | VERIFIED | 15/15 tables present; RLS enabled on all; staging/admin tables deny-all (service-role only); migration 005 column present; monitor healthy (last fetch 2026-07-10 02:17 UTC); compliance review approved |
| Secrets handling | VERIFIED (repo side) | Service-role key confined to `lib/supabase/admin.ts` (browser guard throws) + scripts; cron/health endpoints 503 without `CRON_SECRET`, constant-time compare; `.env.local` gitignored |
| Monitoring & rollback docs | EXIST | `docs/ozbargain-monitoring.md` (incl. go-live/rollback runbook), `FINAL-LAUNCH-CHECKLIST.md` §10 (Vercel rollback, emergency monitor stop), `/admin/monitor` emergency stop (audited) |
| Migrations verified | PARTIAL | Schema verified complete via probe; migration 008 applied to prod 2026-07-11 (`proconfig` = `search_path=""`, advisor WARN cleared, ledger entry recorded); **watchdog not yet armed** (OPS-3) |

## Conditions to reach READY TO LAUNCH

**Completed conditions:** #1 (2026-07-10) — card offers issuer-checked, one fixed-expiry Amex published, four withheld, five audit entries. #2 (2026-07-11) — the 2 expired gift cards unpublished via the audited cleanup CLI (dry-run reviewed first; re-run reports **0 candidates**). #6 (2026-07-11) — post-cleanup strict smoke against live prod: **28/28, 0 warned**.

Every remaining condition names its owner and its verification. These are the *only* open items — all three need dashboards only the human operator has.

| # | Unmet action | Owner | Verification step |
|---|---|---|---|
| 3 | Create GitHub Actions secrets `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; run one manual "Schema drift" dispatch to green | Mayank | Workflow run green (exit 0) |
| 4 | Configure external uptime alert on `GET /api/health/monitor` (Bearer `CRON_SECRET`, every 3h); test alert delivery once with a wrong token | Mayank | One received alert from the wrong-token test |
| 5 | Confirm Supabase automatic backups / PITR enabled for the prod project | Mayank | Dashboard confirmation noted here |

Recommended (not gating): complete TASK-001/002/003 (see backlog); enable Supabase leaked-password protection while in the dashboard for #5.

## Risk acceptances required at launch

These are known, documented, and deliberately NOT fixed pre-launch. Launching means accepting them; each has post-launch ownership in the backlog (DEF-1/2/4/5).

1. **Admin rate limiter is fail-open and non-atomic** (count-then-insert). Threat model: trusted allowlisted admins (currently one); limiter exists to stop runaway mistakes, not adversaries. Post-launch: atomic DB function.
2. **Audit logging is best-effort**, not transactional with the mutation it records. Post-launch: transactional RPC.
3. **No CSP header** — documented decision (`next.config.ts`); requires nonce plumbing through the frozen root layout. Post-launch review.
4. **Supabase migration ledger incomplete** (001–003 hand-applied and untracked; schema itself verified complete). Mitigated by `verify:schema` + weekly watchdog once armed (condition #3).

## Decision log

| Date | Status | Note |
|---|---|---|
| 2026-07-10 | CONDITIONALLY READY | Initial assessment at `1fae4ed`. Code verified launch-grade (local gate + live prod strict smoke 28/28 + read-only prod DB verification). Blocked solely on operational conditions 1–6 above. |
| 2026-07-10 | CONDITIONALLY READY | Card-offer condition #1 complete: five issuer checks, one fixed-expiry offer published, four deliberately withheld, and five audit entries recorded. Conditions #2–6 remain. |
| 2026-07-11 | CONDITIONALLY READY | All three recommended worker tasks APPROVED after manager review (TASK-002 `8213003`, TASK-001 `37854b0`, TASK-003 `6845117`). Fresh strict smoke against live prod: 28/28, 0 warned. Status unchanged — remaining items are ops conditions #2–6 plus the human-authorised prod application of migration 008 (repo-approved, not yet applied; `pg_proc.proconfig` verified NULL). |
| 2026-07-11 | CONDITIONALLY READY | Migration 008 applied to prod on user authorisation ("do it"), by the manager via the Supabase API using the exact reviewed SQL. Verified: `proconfig` = `search_path=""`; advisor re-run shows `function_search_path_mutable` WARN cleared; ledger entry `008_pin_function_search_path` recorded. All code-side launch work is now complete **and live**. Only ops conditions #2–6 remain. |
| 2026-07-11 | CONDITIONALLY READY | Conditions #2 and #6 completed on user authorisation: expired gift cards unpublished (dry-run reviewed → `--write` → 2 audited rows → re-run dry-run 0 candidates) and post-cleanup strict smoke against live prod **28/28, 0 warned**. The cleanup UPDATEs also exercised the newly-pinned `set_updated_at` trigger in prod — behaviour confirmed intact. **Remaining: conditions #3, #4, #5 only** (GitHub secrets + watchdog dispatch, external health alert, backups/PITR confirmation) — all require the operator's dashboards; nothing further is executable from the repo. |
