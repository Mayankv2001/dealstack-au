# Validation Matrix

> 2026-07-20. What proves each task done. ● required · ○ if-touched/optional · — n/a. "Suites" = the scoped vitest suite(s) named in the task file. Universal baseline for every code task: `npm run lint && npx tsc --noEmit && npm run build` (Node 20; until TASK-TEST-002 lands, run lint/vitest scoped to real trees only — see that task).

| Task | Unit | Integration/suite | E2E (Playwright) | Build | Lint | Typecheck | Schema/manifest | Manual UI | Mobile | A11y | Prod observation | DB verification |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TEST-001 | ● test:decision | ○ six CI suites | — | ● | ● | ● (the point) | — | — | — | — | — | — |
| TEST-002 | ● root vitest now-clean | ● all suites | ○ | ● | ● (now-clean) | ● | — | — | — | — | — | — |
| DOC-001 | — | — | — | — | — | — | — | ● read-through + grep | — | — | — | — |
| CRON-001 | ● schedule tests | ● tests/giftcards route tests | — | ● | ● | ● | — | — | — | — | ○ next scheduled window | — |
| CRON-002 | ● schedule tests | ● route gate-order tests | — | ● | ● | ● | — | — | — | — | ● observe a recovery | — |
| CRON-003 | — | — | — | — | — | — | — | — | — | — | ● (is the task) | ○ run-ledger rows appear |
| GC-001 | — | — | — | — | — | — | — | ● admin review UI | — | — | ● prod offer reads | ● row states recorded |
| DB-001 | — | ● test:admin after | — | ● | ● | ● | ● verify:schema + types | — | — | — | ● post-apply checks | ● information_schema |
| STACK-001 | ● agreement/label | ● test:stack | ○ | ● | ● | ● | — | ● calc vs stack compare | ○ | — | — | — |
| EXP-001 | ● warning tests | ● test:stack | — | ● | ● | ● | — | ● card render | — | — | — | — |
| EXP-002 | ○ | ○ | ● expired-permalink case | ● | ● | ● | — | ● dated fixture view | ● | ○ | ● live expired URL | — |
| REL-001 | ● route response tests | ● test:monitor | — | ● | ● | ● | — | — | — | — | — | — |
| REL-002 | ● health tests | ● test:monitor/admin | — | ● | ● | ● | — | — | — | — | ○ endpoint outputs | — |
| SEARCH-001 | ● near-match tests | ● test:monitor | ● typo query | ● | ● | ● | — | ● correction note | ● | — | — | — |
| SEARCH-002 | ○ helper | — | ● zero-hit case | ● | ● | ● | — | ● | ● | ○ axe on state | — | — |
| TEST-003 | ● property files | ● test:stack | — | ● | ● | ● | — | — | — | — | — | — |
| PERF-001 | — | — | — | ● (route table source) | — | — | — | ● doc review | ● Lighthouse mobile | — | ○ read-only loads | — |
| A11Y-001 | — | — | ● full spec both projects | ● | ● | ● | — | ● contrast eyeball | ● (Pixel-5 project) | ● (is the task) | — | — |
| SEO-001 | ● builder tests | — | ○ script-tag assert | ● | ● | ● | — | ● view-source + Rich Results | — | — | — | — |
| SEO-002 | ● sitemap test | — | — | ● | ● | ● | — | ● /sitemap.xml | — | — | — | — |

## Cross-cutting checks
- **Migration-contract:** only DB-001 touches schema; its gate is `npm run verify:schema`, regenerated types drift-free, and `information_schema` verification per MIGRATION-SAFETY.
- **No-regression floor:** any task touching `lib/` reruns its area suite (CLAUDE.md checklist) even if the matrix row marks it ○.
- **Honest reporting:** a validation cell counts only if the command was actually run; agents report exact commands + outputs (MANAGER-WORKER-GUIDE).
