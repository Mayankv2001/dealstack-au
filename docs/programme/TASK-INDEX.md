# Task Index — DealStack AU improvement programme

> Programme snapshot 2026-07-20 (audit HEAD `9b7365f`). One row per open task file created by the 2026-07-19/20 full-repository audit. Prior corpora — `docs/backlog/DEALSTACK-BACKLOG.md` (DS-001…DS-108, still authoritative for its tickets) and `tasks/gift-card-automation/` (TASK-00…39, largely executed) — are intentionally NOT duplicated here; audit tasks cross-reference DS tickets where they overlap.

| ID | Priority | Workstream | File | One-line problem |
|---|---|---|---|---|
| TASK-CRON-001 | P1 | CRON | [tasks/cron/TASK-CRON-001-weekly-ingest-weekly-interval-guard.md](../../tasks/cron/TASK-CRON-001-weekly-ingest-weekly-interval-guard.md) | "Weekly" Point Hacks ingest runs on a 40h guard → up to ~3 fetches/week |
| TASK-CRON-002 | P2 | CRON | [tasks/cron/TASK-CRON-002-missed-run-catchup-window.md](../../tasks/cron/TASK-CRON-002-missed-run-catchup-window.md) | Fully missed Sydney-7am window has no automated catch-up |
| TASK-CRON-003 | P1 | CRON | [tasks/cron/TASK-CRON-003-verify-actions-secret-and-schedule-liveness.md](../../tasks/cron/TASK-CRON-003-verify-actions-secret-and-schedule-liveness.md) | Whether any scheduled job runs in production is unverified (Actions secret / schedule liveness) |
| TASK-DB-001 | P1 | DB | [tasks/database/TASK-DB-001-apply-migration-033-approval-hardening.md](../../tasks/database/TASK-DB-001-apply-migration-033-approval-hardening.md) | Migration 033 approval hardening written but unapplied (human-gated apply) |
| TASK-GC-001 | P1 | GC | [tasks/gift-cards/TASK-GC-001-legacy-offer-review-before-033.md](../../tasks/gift-cards/TASK-GC-001-legacy-offer-review-before-033.md) | 10 legacy gift-card offers must be reviewed before 033 |
| TASK-EXP-001 | P2 | EXP | [tasks/expiry/TASK-EXP-001-warn-never-checked-layers.md](../../tasks/expiry/TASK-EXP-001-warn-never-checked-layers.md) | Never-verified stack layers carry no freshness warning while 22-day-old ones do |
| TASK-EXP-002 | P2 | EXP | [tasks/expiry/TASK-EXP-002-expired-permalink-presentation.md](../../tasks/expiry/TASK-EXP-002-expired-permalink-presentation.md) | Expired deal permalinks must unmistakably present as expired (verify + fix) |
| TASK-REL-001 | P2 | REL | [tasks/reliability/TASK-REL-001-monitor-feeds-error-response-hygiene.md](../../tasks/reliability/TASK-REL-001-monitor-feeds-error-response-hygiene.md) | monitor-feeds echoes raw internal error text against sibling convention |
| TASK-REL-002 | P2 | REL | [tasks/reliability/TASK-REL-002-health-state-vocabulary.md](../../tasks/reliability/TASK-REL-002-health-state-vocabulary.md) | Health endpoints lack a shared healthy/degraded/stale/paused vocabulary |
| TASK-TEST-001 | P1 | TEST | [tasks/testing/TASK-TEST-001-fix-decision-test-type-errors.md](../../tasks/testing/TASK-TEST-001-fix-decision-test-type-errors.md) | `tsc --noEmit` red at HEAD: two decision-test fixtures omit required `stackData` |
| TASK-TEST-002 | P1 | TEST | [tasks/testing/TASK-TEST-002-exclude-stale-worktrees-from-tooling.md](../../tasks/testing/TASK-TEST-002-exclude-stale-worktrees-from-tooling.md) | Stale `.claude/worktrees/` poison vitest/eslint/tsc with thousands of false failures |
| TASK-TEST-003 | P2 | TEST | [tasks/testing/TASK-TEST-003-stack-engine-property-tests.md](../../tasks/testing/TASK-TEST-003-stack-engine-property-tests.md) | Stack-maths honesty invariants unpinned by property tests |
| TASK-STACK-001 | P1 | STACK | [tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md](../../tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md) | Calculator and stack engine can show different totals with no explanation |
| TASK-SEARCH-001 | P2 | SEARCH | [tasks/search/TASK-SEARCH-001-typo-tolerant-matching.md](../../tasks/search/TASK-SEARCH-001-typo-tolerant-matching.md) | One typo zeroes search results; add bounded near-match store resolution |
| TASK-SEARCH-002 | P2 | SEARCH | [tasks/search/TASK-SEARCH-002-zero-hit-recovery-and-test.md](../../tasks/search/TASK-SEARCH-002-zero-hit-recovery-and-test.md) | Zero-hit search state is honest but a dead end; add recovery + pin with a test |
| TASK-DOC-001 | P1 | DOC | [tasks/medium/TASK-DOC-001-reconcile-project-state-migration-truth.md](../../tasks/medium/TASK-DOC-001-reconcile-project-state-migration-truth.md) | PROJECT_STATE.md contradicts itself about migrations 027–033 |
| TASK-PERF-001 | P2 | PERF | [tasks/performance/TASK-PERF-001-performance-baseline-and-budgets.md](../../tasks/performance/TASK-PERF-001-performance-baseline-and-budgets.md) | No performance baseline/budgets; measurement before any optimisation |
| TASK-A11Y-001 | P2 | A11Y | [tasks/accessibility/TASK-A11Y-001-expand-axe-and-interaction-coverage.md](../../tasks/accessibility/TASK-A11Y-001-expand-axe-and-interaction-coverage.md) | Axe covers 7 routes, no detail templates, no keyboard/reduced-motion checks |
| TASK-SEO-001 | P3 | SEO | [tasks/seo/TASK-SEO-001-itemlist-structured-data-listings.md](../../tasks/seo/TASK-SEO-001-itemlist-structured-data-listings.md) | Listing pages carry no ItemList structured data |
| TASK-SEO-002 | P3 | SEO | [tasks/seo/TASK-SEO-002-sitemap-detail-coverage-lastmodified.md](../../tasks/seo/TASK-SEO-002-sitemap-detail-coverage-lastmodified.md) | Sitemap omits live detail-route families and all lastModified |

**Counts:** P0 0 · P1 8 · P2 10 · P3 2 — 20 tasks.

Supporting documents: audits in [docs/audit/](../audit/), decisions ADR-001…003 in [docs/decisions/](../decisions/), runbooks (9) in [docs/runbooks/](../runbooks/), programme files in this folder.

Maintenance rule: any session that adds, completes, or reprioritises a task updates this index, [PRIORITY-ROADMAP.md](PRIORITY-ROADMAP.md), and [TASK-DEPENDENCY-MAP.md](TASK-DEPENDENCY-MAP.md) in the same change.
