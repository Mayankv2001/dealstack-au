# Priority Roadmap

> 2026-07-20, reconciled 2026-07-22. Listing of every audit-programme task by priority, open and done. P0/P1 open listings are exhaustive per the programme's final-review rule.

## Done (8 — see TASK-INDEX.md for verification evidence)
TASK-TEST-001 · TASK-TEST-002 · TASK-GC-001 · TASK-DB-001 · TASK-DOC-001 · TASK-CRON-001 (all P1) · TASK-SEO-001 (P3) · TASK-SEARCH-001 (P2) — verified 2026-07-22.

## P0 — correctness, security, production safety
*None open.* The security audit found no new confirmed vulnerability (`docs/audit/SECURITY-AUDIT.md`), and no expired-as-current, auth-bypass, or wrong-price defect was confirmed. Standing P0 *conditions* (not tasks): anything matching the P0 rules discovered later jumps the queue; the demo-fallback-in-production tell in `docs/runbooks/PRODUCTION-HEALTH-CHECK.md` is the canonical example.

## P1 — trust, data freshness, critical UX (2 open — exhaustive)
| Task | Why P1 |
|---|---|
| TASK-CRON-003 | Scheduled ingestion may not run AT ALL in production (secret evidence from 2026-07-13); every freshness guarantee hangs on this |
| TASK-STACK-001 | Two first-party totals can disagree with no explanation — direct hit on the trust principle |

## P2 — customer experience, operations, performance (8)
TASK-CRON-002 (missed-window catch-up) · TASK-EXP-001 (never-checked warning symmetry) · TASK-EXP-002 (expired-permalink presentation) · TASK-REL-001 (error-echo hygiene) · TASK-REL-002 (health-state vocabulary) · TASK-SEARCH-002 (zero-hit recovery) · TASK-TEST-003 (stack property tests) · TASK-PERF-001 (baseline/budgets) · TASK-A11Y-001 (axe + interaction coverage). *(TASK-SEARCH-001 typo tolerance — done 2026-07-22.)*

## P3 — polish, SEO, long-term (1)
TASK-SEO-002 (sitemap coverage + lastModified). *(TASK-SEO-001 ItemList — done 2026-07-22.)*

## Ordering within priority
Do P1 in this order: CRON-003 → STACK-001. P2/P3 order is driven by file-conflict sequencing, not priority nuance — see TASK-DEPENDENCY-MAP.md.

## Relationship to the DS backlog
DS-001…DS-108 keep their own priorities in `docs/backlog/DEALSTACK-BACKLOG.md`. Where an audit task supersedes or gates a DS ticket it says so in its own file; this roadmap governs only the 20 audit tasks.
