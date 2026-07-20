# Current-State Audit — DealStack AU

> Audit date: 2026-07-19 · HEAD `9b7365f` · Read-only session; no code, data, or production change was made.
> Classification legend: **Confirmed defect** (reproduced from repo evidence) · **Probable defect** · **Design weakness** · **Missing verification** · **Enhancement**.

## Overall assessment

The codebase is unusually disciplined for its size: pure, dependency-injected engines; timing-safe cron auth; DST-safe Sydney scheduling; guaranteed run finalisation with lock backstops; read-time expiry filtering on every public repo path; honest static-fallback separation ("configured empty stays empty"); a 4,100+-test suite that is green. Most classic failure modes this audit hunts for are already engineered against, and most residual work is already ticketed in `docs/backlog/DEALSTACK-BACKLOG.md` (DS-001…DS-108).

What this audit adds is (a) defects introduced or exposed **after** the 2026-07-13 backlog snapshot, (b) local tooling/CI truth problems, and (c) gaps the backlog does not cover (search quality, sitemap coverage, calculator/engine divergence).

## Confirmed findings (highest impact first)

### 1. `npx tsc --noEmit` fails at HEAD — CI typecheck gate is red
- **Evidence:** run 2026-07-19: `tests/decision/buildDecisionResult.test.ts(80,3)` and `tests/decision/giftCardRanking.test.ts(8,7)` — `DealsBundle.stackData` is now required but the test fixtures omit it (type errors TS2322/TS2741). Introduced by the merchant-facts change (`a783e12`) that made `stackData` required on `DealsBundle`.
- **Impact:** `ci.yml` runs `npx tsc --noEmit` before tests; the next push to main should fail CI. Vitest passes because it does not typecheck.
- **Classification:** Confirmed defect → `tasks/testing/TASK-TEST-001`.

### 2. Repo-root tooling is polluted by stale `.claude/worktrees/`
- **Evidence:** `npx vitest run` → 62 failures, all in `.claude/worktrees/**` (real `tests/` tree: green). `npm run lint` → 2,512 errors / 29,757 warnings, 100% of flagged files under `.claude/worktrees/**`. `vitest.config.ts` excludes only `tests/e2e/**`, `node_modules`, `.git`; `eslint.config.mjs` ignores only `.next/out/build`; `tsconfig.json` includes `**/*.ts` with only `node_modules` excluded.
- **Impact:** The commit checklist in CLAUDE.md ("npm run lint must pass") cannot be satisfied locally; the backlog's standard validation command (`npx vitest run`) reports false failures; agents may "fix" phantom breakage or distrust real signals.
- **Classification:** Confirmed defect → `tasks/testing/TASK-TEST-002`.

### 3. PROJECT_STATE.md contradicts itself and the migration docs about 027–033
- **Evidence:** `docs/launch-management/PROJECT_STATE.md` line ~5 and §platform say "027–033 … NOT applied"; the same file's §5 says "ledger canonical through 032"; `docs/gift-card-migration-028-030.md` says applied to production 2026-07-17. Migration 033 is genuinely still gated (`docs/gift-card-migration-033-approval-hardening.md`).
- **Impact:** The next operator/agent gets a false picture of production schema state — the exact failure mode DS-011 was raised to prevent, recurring.
- **Classification:** Confirmed defect (documentation) → `tasks/medium/TASK-DOC-001`.

### 4. `monitor-feeds` cron echoes raw internal error text
- **Evidence:** `app/api/cron/monitor-feeds/route.ts` catch path returns `{ error: errMessage(error) }` and includes `complianceError` verbatim; every other cron route deliberately returns a fixed string ("gift-card ingest failed" etc.) and the recheck route documents "never echo a raw internal message".
- **Impact:** Low (caller must hold CRON_SECRET) but the GH workflow prints selected response keys into public run logs; convention divergence invites a real leak later.
- **Classification:** Confirmed defect (hygiene) → `tasks/reliability/TASK-REL-001`.

### 5. Point Hacks "weekly" ingest runs on the every-other-day guard
- **Evidence:** `app/api/cron/gift-card-weekly-ingest/route.ts` calls `decideSchedule` (`lib/giftcards/schedule.ts`, `RUN_INTERVAL_GUARD_HOURS = 40`); the workflow fires daily at both Sydney-7am UTC slots. Result: up to ~3 fetches/week of an editorial page whose content changes weekly (Wednesday per `docs/` and `lib/giftcards/pointHacksWeekly.ts` naming).
- **Impact:** Over-fetching a manually-permissioned source; also mislabels the operating contract ("weekly").
- **Classification:** Probable defect (intent unclear; conditional GET may make extra fetches cheap) → `tasks/cron/TASK-CRON-001`.

### 6. Migration 033 apply is still an open, gated production action
- **Evidence:** doc trail above; approval-hardening RPC replacement written and reviewed; PROJECT_STATE next-steps also requires "review the 10 active legacy gift-card offers before migration 033".
- **Classification:** Missing verification / human-gated work → `tasks/gift-cards/TASK-GC-001` + `tasks/database/TASK-DB-001`.

## Design weaknesses (evidence in per-area audits)

- Stack warnings stay silent when an offer has **no** `lastCheckedAt` (`lib/stack/compatibility.ts` `staleDataWarning` returns null on missing) — a never-verified layer looks cleaner than a 22-day-old one. → TASK-EXP-001.
- Two parallel stacking implementations: `lib/calculateStack.ts` (calculator UI) ignores caps, min-spend, denominations that `lib/stack/buildStack.ts` honours. → TASK-STACK-001.
- Search is exact-substring, every-term-must-match, no alias/typo tolerance beyond `findMerchantIdInText` (`lib/sources/searchSources.ts`). → TASK-SEARCH-001/002.
- Cron catch-up: gift-card ingest/lifecycle accept runs only during the Sydney-7am hour; if both UTC fires fail (GitHub outage), the day is lost until manual `workflow_dispatch` + `?force=1`. Documented, but no automated late window. → TASK-CRON-002.
- Sitemap omits gift-card offer detail pages (`/gift-cards/[id]`), card detail (`/cards/[id]`), `/gift-cards/weekly/plan`; no `lastModified`. → TASK-SEO-002.
- JSON-LD only on `/`, `/deals/[slug]`, `/stores/[slug]` (grep of `JsonLd` usage). Gift-card pages: DS-064/065 already ticketed; listing-page ItemList remains unticketed. → TASK-SEO-001.

## Verified-good (checked, no task needed)

- Expiry convention consistent everywhere inspected: `todayAU()` string compare, live ON expiry day, null ≠ ongoing (`lib/offers/expiry.ts`, `lib/giftcards/dateState.ts`, `lib/repos/offers.ts:198-201`, `topDeals.ts`, `sourceResults.ts`, `currentOffers.ts`, `publicQuery.ts`).
- All six cron routes: timing-safe bearer auth, 503-on-missing-secret, default-off env gates, DB source gates that `force` cannot bypass, locked runs with guaranteed finalisation (`lib/giftcards/runGuarded.ts`) and stale-run takeover backstop.
- `.env.local` is git-ignored (verified `git check-ignore`); env access centralised and lazy (`lib/env.ts`); service-role helper server-only.
- Only one `dangerouslySetInnerHTML` in the app (`components/JsonLd.tsx`, serialised JSON-LD).
- Static-vs-DB fallback: `lib/repos/index.ts` contract — configured empty/error reads stay empty, demo data cannot masquerade as live.
- Admin rate limiting via Postgres RPC with advisory lock; fail-open is a documented availability choice.
- e2e includes axe scans and a mobile viewport project; CI runs the full ladder.

## Open items requiring production observation (cannot be verified from the repo)

- Do the GitHub Actions `CRON_SECRET` repository secrets exist and are the five scheduled workflows green? (Memory of 2026-07-13 state says the secret was missing and monitor-health was red by design — DS-078.) → TASK-CRON-003.
- Actual published-offer data quality (null expiries, stale checks) — DS-001…DS-007 remain the authority; re-verify counts before acting.
- Whether `/deals/[slug]` permalinks for expired deals present an unmistakable expired state → TASK-EXP-002.
