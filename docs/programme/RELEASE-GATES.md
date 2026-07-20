# Release Gates

> 2026-07-20. Conditions that must hold before (a) any batch of programme work merges to main, and (b) the programme is declared complete. A gate is "green" only when actually checked — name the command/observation and date when signing one off.

## Gate set A — before every merge to main
1. **CI ladder green locally:** `npm run lint`, `npx tsc --noEmit`, affected suites, `npm run build` (Node 20). Until TASK-TEST-002 merges, scope lint/vitest to real trees and say so in the report.
2. **No new P0 condition:** change introduces no expired-as-current path, no approval-boundary weakening, no gate-default flip, no secret in code/logs/responses.
3. **Intended-files-only:** `git status` diff reviewed; no stray worktree/fixture/env files staged.
4. **Tests accompany behaviour:** every behavioural change lands with its required tests from the task file (VALIDATION-MATRIX row satisfied).

## Gate set B — before the gated production actions (DB-001 specifically)
5. **Migration ledger reconciled:** PROJECT_STATE §5, the ledger reconciliation doc, and `information_schema` reality agree (TASK-DOC-001 done; MIGRATION-SAFETY pre-checks run).
6. **Usable backup or explicit written risk acceptance:** PITR/backup demonstrated restorable, or the owner signs the risk in writing. No silent default.
7. **Pre-review complete:** TASK-GC-001's 10-offer review attached, expected visibility changes acknowledged.
8. **Human at the keyboard:** the apply is never delegated to an implementation agent.

## Gate set C — before declaring data-freshness claims true (marketing, docs, health copy)
9. **Cron liveness proven:** TASK-CRON-003 shows ≥ 7 consecutive days of green scheduled runs with advancing ledgers.
10. **Cron replay safety verified:** one supervised MANUAL-PIPELINE-REPLAY exercised and documented.
11. **Expiry boundary verified in production:** one offer observed crossing its Sydney expiry date and leaving all public surfaces within the ISR window (read-only observation).
12. **No demo fallback in production:** PRODUCTION-HEALTH-CHECK spot-check confirms live-data mode.

## Gate set D — programme completion
13. All 20 tasks Done/Rejected-with-reason in TASK-INDEX.md; no open P0/P1.
14. Mobile + accessibility: A11Y-001 merged; full Playwright spec green in both viewport projects.
15. Performance floor: PERF-001 baseline committed with budgets proposed.
16. Monitoring ready: health endpoints + monitor-health workflow green; REL-002 vocabulary in place; runbooks referenced from the admin docs.
17. Programme docs current: index/roadmap/dependency map reflect final state (R10 mitigation).

## Standing red lines (never gated open)
- No unverified offer published; no predicted offer presented as confirmed current.
- No sub-daily `vercel.json` schedule (Hobby limit); no HTML scraping; no Cashrewards references.
- No RLS/security-policy change without prior explanation and approval.
