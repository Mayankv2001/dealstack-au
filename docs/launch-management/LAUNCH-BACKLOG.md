# DealStack AU — Launch Backlog

> Source of truth for launch work. Maintained by the launch manager (Fable 5).
> Statuses: DISCOVERED / READY / IN_PROGRESS / IMPLEMENTED / REVIEW_FAILED / APPROVED / BLOCKED / DEFERRED.
>
> Companion files: [`ASSIGNMENTS.md`](ASSIGNMENTS.md) (who is doing what),
> [`LAUNCH-DECISION.md`](LAUNCH-DECISION.md) (go/no-go gate),
> [`tasks/`](tasks/) (worker task specs), [`prompts/`](prompts/) (worker prompts).

## Assessment header

| Field | Value |
|---|---|
| Repository commit | `1fae4ed` (main, clean tree, pushed to `origin/main`) |
| Assessment date | 2026-07-10 |
| Assessed by | Fable 5 (launch manager) |
| Current launch status | **CONDITIONALLY READY** — see [`LAUNCH-DECISION.md`](LAUNCH-DECISION.md) |
| Production deployment | `dealstack-au.vercel.app` — latest production deploy READY (2026-07-10) |

## Baseline verification performed (2026-07-10, commit `1fae4ed`)

All executed by the manager, not taken from documentation:

| Check | Command | Result |
|---|---|---|
| Lint | `npm run lint` (Node 20) | PASS (clean) |
| Monitor tests | `npm run test:monitor` | PASS — 203/203 |
| Stack tests | `npm run test:stack` | PASS — 166/166 |
| Admin tests | `npm run test:admin` | PASS — 114/114 |
| Production build | `npm run build` | PASS |
| Live prod smoke + strict content | `npm run smoke -- --strict-content --base-url=https://dealstack-au.vercel.app` | PASS — 28/28, 0 warned. Includes: all public routes 200, admin routes 307→login, cron/health endpoints refuse unauthenticated access, robots/sitemap/OG on prod host (no localhost leak), all security headers + HSTS, zero banned trust markers on any public page |
| Prod schema (read-only, Supabase API) | `list_tables` + `information_schema` probes | PASS — 15/15 expected tables present, RLS enabled on all; `feed_items.hidden_from_homepage` (005) present |
| Prod security advisors (Supabase) | `get_advisors --security` | 2 WARN (see TASK-001 and OPS-6); 8 INFO "RLS enabled no policy" on staging/admin tables — **expected by design** (deny-all = service-role only) |
| Prod data hygiene (Supabase repository checks) | counts on offers/signals/compliance | One expired-published gift card on 2026-07-10 (a second expires after today); all 5 card rows were issuer-checked, illustrative copy was removed, 1 fixed-expiry offer is published and 4 are deliberately withheld; compliance approved; 1 admin row |

Checks **not** performed (and why): GitHub Actions run history (`gh` CLI unauthenticated on this machine — CI config verified by reading `.github/workflows/ci.yml`, and its exact steps passed locally); Vercel env var listing (not exposed by the available API — verified *indirectly*: prod smoke proves `NEXT_PUBLIC_SITE_URL` correct and security headers active; the 02:17 UTC monitor run proves `CRON_SECRET` + monitor vars work); Supabase backup/PITR configuration (dashboard-only — OPS-5).

## Reconciliation of existing plans

`PROJECT_STATE.md`, `FINAL-LAUNCH-CHECKLIST.md` and `AUDIT_REPORT.md` were checked against code and live systems. **They are accurate.** The claim "all code backlogs shipped; remaining work is human ops" is confirmed with two qualifications, both now tracked here: the Supabase advisor WARN on `set_updated_at` (TASK-001) and small operator-facing documentation drift (TASK-002). Completed root `PLAN-*.md` files have been removed; launch work is tracked here.

## Launch blockers

All remaining blockers are **operational** (need human access, credentials, or a production judgement call). No launch-blocking code defects were found.

| ID | Item | Owner | Status | Evidence / verification |
|---|---|---|---|---|
| OPS-1 | **Card-offer data decision.** All 5 rows were checked against current issuer pages and corrected on 2026-07-10. Amex Qantas Ultimate has a fixed expiry and is published; NAB, Westpac and ANZ have no issuer-stated fixed expiry and remain unpublished; the obsolete CommBank promotion remains unpublished. | Mayank | APPROVED | Repository read returns exactly 1 public-ready row; all placeholder copy is removed; 5 `direct-card-offer-verification` audit entries record the user-authorised update. |
| OPS-2 | **Unpublish 2 expired-published gift cards** — DONE 2026-07-11 (user-authorised "do it", executed by manager): dry-run reviewed (exactly the 2 known cards, nothing else), applied via `npm run cleanup:old-deals -- --write` (Node 22), 2 audited `auto-unpublish-expired` rows written. | Mayank (authorised) / manager (executed) | APPROVED | Re-run dry-run: **0 candidates — "Nothing to clean"**. The 2 report-only no-expiry flags (TopCashback Chemist Warehouse, Flybuys base) are legitimately open-ended and untouched. |
| OPS-3 | **Schema-drift watchdog secrets** — DONE (verified 2026-07-23). Both secrets present (added 2026-07-10); the weekly "Schema drift" workflow's last scheduled run (2026-07-20) is green. | Mayank | APPROVED | Both secrets confirmed via `gh secret list`; last run green (exit 0). |
| OPS-4 | **External monitor health alert — Option B (GitHub Actions) chosen by user 2026-07-11.** Workflow `.github/workflows/monitor-health.yml` shipped: polls the endpoint every 3h, fails on non-2xx (GitHub failure notification = alert), exit 2 when the secret is missing so a blind check stays red. DONE (verified 2026-07-23): `CRON_SECRET` present (added 2026-07-13); monitor-health runs green every 3h. | Mayank (auth + secret) / manager (dispatch, verify) | APPROVED | `CRON_SECRET` confirmed present; monitor-health green. NB secret present ≠ gated gift-card jobs run (lifecycle still `environment-disabled`). |
| OPS-5 | **Confirm Supabase backups/PITR enabled** for the prod project (checklist §10). | Mayank | BLOCKED (human) | Dashboard screenshot / note in LAUNCH-DECISION. |
| OPS-7 | **Post-cleanup strict smoke re-run** — DONE 2026-07-11 immediately after OPS-2: `npm run smoke -- --strict-content --base-url=https://dealstack-au.vercel.app`. Side confirmation: the cleanup UPDATEs fired the newly-pinned `set_updated_at` trigger successfully (migration 008 behaviour-preserving in prod). | Manager | APPROVED | **28/28 passed, 0 failed, 0 warned** — recorded in LAUNCH-DECISION. |

## Code / docs tasks (worker-executable)

| ID | Title | Severity | Launch impact | Confidence | Effort | Worker | Status | Depends on | Commit | Review |
|---|---|---|---|---|---|---|---|---|---|---|
| [TASK-001](tasks/TASK-001-pin-set-updated-at-search-path.md) | Migration 008: pin `set_updated_at()` search_path (clears Supabase security WARN) | Low | Recommended | Confirmed | Small | Claude Sonnet | APPROVED | — | `37854b0` | [REVIEW-TASK-001](reviews/REVIEW-TASK-001.md) — all 6 criteria PASS, verification re-run by manager 2026-07-11; prod probe confirms no production write by the worker |
| [TASK-002](tasks/TASK-002-operator-env-docs-accuracy.md) | Operator env docs accuracy (README required-env table, `.env.example` ADMIN_EMAILS) | Medium | Required | Confirmed | Small | Claude Sonnet (actual; Haiku was recommended) | APPROVED | — | `8213003` | [REVIEW-TASK-002](reviews/REVIEW-TASK-002.md) — all 5 criteria PASS, verification re-run by manager 2026-07-10 |
| [TASK-003](tasks/TASK-003-deals-disclaimer-wording-accuracy.md) | `/deals` disclaimer wording: "cached examples" understates real curated data | Low | Recommended | Confirmed | Small | Claude Sonnet (actual; Haiku recommended) | APPROVED | — | `6845117` | [REVIEW-TASK-003](reviews/REVIEW-TASK-003.md) — all 5 criteria PASS; verified on live prod (strict smoke 28/28, new copy serving) 2026-07-11 |

**TASK-001 follow-up — DONE 2026-07-11 (user-authorised, applied by manager via Supabase API):** migration 008 applied to prod with the exact reviewed SQL from `37854b0`; verified `pg_proc.proconfig` = `search_path=""` and advisor re-run confirms the `function_search_path_mutable` WARN is cleared (remaining: 8 expected INFO lints + DEF-6 leaked-password WARN). Recorded in the Supabase migration ledger as `008_pin_function_search_path`. Rollback if ever needed: `ALTER FUNCTION public.set_updated_at() RESET search_path;`.

**Dependency order:** none between the three — zero file overlap. Recommended sequence when run one-at-a-time in the shared working tree: TASK-002 → TASK-001 → TASK-003 (operator docs first, since deploy verification reads them). **Safe parallel group:** {001, 002, 003} only if each worker uses its own branch/worktree.

## Non-blocking improvements (post-launch, with explicit ownership)

| ID | Item | Severity | Rationale for deferral |
|---|---|---|---|
| DEF-1 | Atomic admin rate limiting (count-then-insert race; fail-open) — needs a DB function/migration | Medium | Documented, deliberate availability tradeoff (`lib/admin/rate-limit.ts` header). Threat model is trusted, allowlisted admins (1 row in prod); limiter guards against runaway scripts, not adversaries. A new RPC migration near launch adds more risk than it removes. Post-launch. |
| DEF-2 | Transactional audit writes (mutation + `audit_log` row are separate writes) | Medium | Same reasoning as DEF-1 (`AUDIT_REPORT.md` Remaining Risks). Best-effort audit is documented; append-only log exists and is used. Post-launch RPC work. |
| DEF-3 | Privacy/legal page | Low | Public site collects **no** personal data: no analytics of any kind (grep-verified), no forms except GET search, cookies only for admin login. Disclaimers + non-affiliation copy present on every public surface. Add a lightweight privacy note post-launch. |
| DEF-4 | Content-Security-Policy header | Low | Deliberate, documented decision (`next.config.ts` comment): needs nonce plumbing through the frozen root layout. Revisit post-launch. |
| DEF-5 | Supabase migration ledger backfill (001–003 hand-applied, not in `supabase_migrations`; 004 tracked under a different name) | Low | Ledger is cosmetic here: actual schema verified complete by `verify:schema` probe and weekly watchdog (columns, not ledger). Rewriting prod migration bookkeeping near launch is risk without behaviour change. |
| DEF-6 | Enable Supabase "leaked password protection" (advisor WARN) | Low | One click in dashboard; admin auth is magic-link-only so passwords are unused. Harmless to enable — fold into any Supabase dashboard visit (can be done with OPS-5). |
| DEF-7 | `/deals` "Notify me" button is permanently disabled (dead UI) | Low | Reads as "coming soon"; harmless. Remove or wire up post-launch. |
| DEF-8 | Vercel project runs Node 24.x vs local/CI Node 20 | Low | Prod build + runtime verified working (deploy READY, smoke 28/28). Consider pinning for parity post-launch. |

## Explicitly out of scope for launch

- Offer-change detection go-live (`OZB_OFFER_DETECT_ENABLED`) — **stays OFF at launch** per checklist §4; go-live runbook in `docs/ozbargain-monitoring.md` is a post-launch human step.
- Any redesign, feature addition, RLS policy change, or cron schedule change.
