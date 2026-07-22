# Task Index — DealStack AU improvement programme

> Programme snapshot 2026-07-20, reconciled 2026-07-22 against actual repo/DB state. One row per task file created by the 2026-07-19/20 full-repository audit. Prior corpora — `docs/backlog/DEALSTACK-BACKLOG.md` (DS-001…DS-108, still authoritative for its tickets) and `tasks/gift-card-automation/` (TASK-00…39, largely executed) — are intentionally NOT duplicated here; audit tasks cross-reference DS tickets where they overlap.
>
> **2026-07-22 reconciliation:** the task files had drifted from reality — 4 of the 20 were already shipped but still read "Planned". Verified directly (not from memory/docs) and corrected: TASK-TEST-001 (`tsc --noEmit` clean), TASK-TEST-002 (`eslint.config.mjs`/`vitest.config.ts` already exclude `.claude/worktrees/**`), TASK-GC-001 and TASK-DB-001 (migrations 033/034/035 confirmed applied via Supabase `list_migrations` on project `numgsivlrglflsnqehac`). One commit (`baab9f9`) carried a misleading message claiming several other features shipped (search typo-tolerance, zero-hit recovery, SEO ItemList/sitemap, property tests) — its actual diff only added the task doc files themselves; none of that code existed.
>
> **2026-07-22 (same day), two more completed for real:** TASK-DOC-001 (PROJECT_STATE.md migration-truth reconciled to the verified ledger — through 035) and TASK-SEO-001 (ItemList JSON-LD builder + tests + wired into /stores, /gift-cards, /deals, browser-verified). Six tasks now Done, 13 open.

## Open (16)

| ID | Priority | Workstream | File | One-line problem |
|---|---|---|---|---|
| TASK-CRON-001 | P1 | CRON | [tasks/cron/TASK-CRON-001-weekly-ingest-weekly-interval-guard.md](../../tasks/cron/TASK-CRON-001-weekly-ingest-weekly-interval-guard.md) | "Weekly" Point Hacks ingest runs on a 40h guard → up to ~3 fetches/week |
| TASK-CRON-002 | P2 | CRON | [tasks/cron/TASK-CRON-002-missed-run-catchup-window.md](../../tasks/cron/TASK-CRON-002-missed-run-catchup-window.md) | Fully missed Sydney-7am window has no automated catch-up |
| TASK-CRON-003 | P1 | CRON | [tasks/cron/TASK-CRON-003-verify-actions-secret-and-schedule-liveness.md](../../tasks/cron/TASK-CRON-003-verify-actions-secret-and-schedule-liveness.md) | Whether any scheduled job runs in production is unverified (Actions secret / schedule liveness) |
| TASK-EXP-001 | P2 | EXP | [tasks/expiry/TASK-EXP-001-warn-never-checked-layers.md](../../tasks/expiry/TASK-EXP-001-warn-never-checked-layers.md) | Never-verified stack layers carry no freshness warning while 22-day-old ones do |
| TASK-EXP-002 | P2 | EXP | [tasks/expiry/TASK-EXP-002-expired-permalink-presentation.md](../../tasks/expiry/TASK-EXP-002-expired-permalink-presentation.md) | Expired deal permalinks must unmistakably present as expired (verify + fix) |
| TASK-REL-001 | P2 | REL | [tasks/reliability/TASK-REL-001-monitor-feeds-error-response-hygiene.md](../../tasks/reliability/TASK-REL-001-monitor-feeds-error-response-hygiene.md) | monitor-feeds echoes raw internal error text against sibling convention |
| TASK-REL-002 | P2 | REL | [tasks/reliability/TASK-REL-002-health-state-vocabulary.md](../../tasks/reliability/TASK-REL-002-health-state-vocabulary.md) | Health endpoints lack a shared healthy/degraded/stale/paused vocabulary |
| TASK-TEST-003 | P2 | TEST | [tasks/testing/TASK-TEST-003-stack-engine-property-tests.md](../../tasks/testing/TASK-TEST-003-stack-engine-property-tests.md) | Stack-maths honesty invariants unpinned by property tests |
| TASK-STACK-001 | P1 | STACK | [tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md](../../tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md) | Calculator and stack engine can show different totals with no explanation |
| TASK-SEARCH-001 | P2 | SEARCH | [tasks/search/TASK-SEARCH-001-typo-tolerant-matching.md](../../tasks/search/TASK-SEARCH-001-typo-tolerant-matching.md) | One typo zeroes search results; add bounded near-match store resolution |
| TASK-SEARCH-002 | P2 | SEARCH | [tasks/search/TASK-SEARCH-002-zero-hit-recovery-and-test.md](../../tasks/search/TASK-SEARCH-002-zero-hit-recovery-and-test.md) | Zero-hit search state is honest but a dead end; add recovery + pin with a test |
| TASK-PERF-001 | P2 | PERF | [tasks/performance/TASK-PERF-001-performance-baseline-and-budgets.md](../../tasks/performance/TASK-PERF-001-performance-baseline-and-budgets.md) | No performance baseline/budgets; measurement before any optimisation |
| TASK-A11Y-001 | P2 | A11Y | [tasks/accessibility/TASK-A11Y-001-expand-axe-and-interaction-coverage.md](../../tasks/accessibility/TASK-A11Y-001-expand-axe-and-interaction-coverage.md) | Axe covers 7 routes, no detail templates, no keyboard/reduced-motion checks |
| TASK-SEO-002 | P3 | SEO | [tasks/seo/TASK-SEO-002-sitemap-detail-coverage-lastmodified.md](../../tasks/seo/TASK-SEO-002-sitemap-detail-coverage-lastmodified.md) | Sitemap omits live detail-route families and all lastModified |

**Counts (open):** P0 0 · P1 3 · P2 9 · P3 1 — 13 tasks.

## Done (6)

| ID | Priority | Workstream | File | Verified |
|---|---|---|---|---|
| TASK-TEST-001 | P1 | TEST | [tasks/testing/TASK-TEST-001-fix-decision-test-type-errors.md](../../tasks/testing/TASK-TEST-001-fix-decision-test-type-errors.md) | `npx tsc --noEmit` clean at HEAD |
| TASK-TEST-002 | P1 | TEST | [tasks/testing/TASK-TEST-002-exclude-stale-worktrees-from-tooling.md](../../tasks/testing/TASK-TEST-002-exclude-stale-worktrees-from-tooling.md) | `eslint.config.mjs` / `vitest.config.ts` exclude `.claude/worktrees/**` |
| TASK-GC-001 | P1 | GC | [tasks/gift-cards/TASK-GC-001-legacy-offer-review-before-033.md](../../tasks/gift-cards/TASK-GC-001-legacy-offer-review-before-033.md) | Migration 033 applied in prod (implies review gate cleared) |
| TASK-DB-001 | P1 | DB | [tasks/database/TASK-DB-001-apply-migration-033-approval-hardening.md](../../tasks/database/TASK-DB-001-apply-migration-033-approval-hardening.md) | Supabase `list_migrations` shows 033/034/035 applied |
| TASK-DOC-001 | P1 | DOC | [tasks/medium/TASK-DOC-001-reconcile-project-state-migration-truth.md](../../tasks/medium/TASK-DOC-001-reconcile-project-state-migration-truth.md) | PROJECT_STATE.md reconciled to verified ledger (through 035) 2026-07-22 |
| TASK-SEO-001 | P3 | SEO | [tasks/seo/TASK-SEO-001-itemlist-structured-data-listings.md](../../tasks/seo/TASK-SEO-001-itemlist-structured-data-listings.md) | ItemList JSON-LD live on /stores, /gift-cards, /deals; 25/25 tests, build green |

Supporting documents: audits in [docs/audit/](../audit/), decisions ADR-001…003 in [docs/decisions/](../decisions/), runbooks (9) in [docs/runbooks/](../runbooks/), programme files in this folder.

Maintenance rule: any session that adds, completes, or reprioritises a task updates this index, [PRIORITY-ROADMAP.md](PRIORITY-ROADMAP.md), and [TASK-DEPENDENCY-MAP.md](TASK-DEPENDENCY-MAP.md) in the same change.
