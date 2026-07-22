# Task Dependency Map

> 2026-07-20, reconciled 2026-07-22. Edges among the audit tasks. Two edge kinds: **hard** (B needs A's outcome) and **conflict** (same files — never run concurrently, any order).
>
> TASK-TEST-001, TASK-TEST-002, TASK-GC-001, TASK-DB-001, TASK-DOC-001, TASK-SEO-001, TASK-CRON-001 and TASK-SEARCH-001 are now Done (see TASK-INDEX.md) — retained below only where they still gate open work.

## Hard dependencies
```
TASK-CRON-003 ──production facts──▶ TASK-CRON-002 (catch-up design should know how often windows are actually missed)
ADR-001 (decision) ──▶ TASK-STACK-001
```
(Resolved: DOC-001→GC-001/DB-001 and ADR-003→CRON-001 — all done.)

## Conflict groups (do not run concurrently within a group)
| Group | Tasks | Shared surface |
|---|---|---|
| C1 stack engine | TASK-STACK-001, TASK-EXP-001, TASK-TEST-003 | `lib/stack/*`, `lib/calculateStack.ts`, `tests/stack/` — run TEST-003 **last** (it pins whatever semantics the other two land) |
| C2 search | TASK-SEARCH-002 (SEARCH-001 done) | `lib/sources/*`, `app/search/page.tsx` — SEARCH-002 must not overlap the SEARCH-001 near-match landing (already merged) |
| C3 e2e spec | TASK-A11Y-001, TASK-SEARCH-002, TASK-EXP-002 | `tests/e2e/public-flows.spec.ts` |
| C4 schedule | TASK-CRON-002 (CRON-001 done) | `lib/giftcards/schedule.ts`, cron routes, `tests/giftcards/` schedule tests |
| C5 cron routes | TASK-REL-001, TASK-REL-002 | cron/health route responses (small overlap; sequencing is cheap insurance) |

Note C2∩C3: SEARCH-002 is in both — schedule it so it doesn't overlap either neighbour.

## Fully independent (safe with anything)
TASK-DOC-001 · TASK-SEO-001 · TASK-SEO-002 · TASK-PERF-001 (read-only; run on a clean checkout) · TASK-CRON-003 (observation only).

## Special-requirement flags
| Requirement | Tasks |
|---|---|
| Production observation (read-only) | CRON-003, EXP-002 (verify live expired permalink), PERF-001 (optional read-only page loads) |
| Schema/DB work | none open — DB-001 (033 apply) is done |
| New dependency allowed | TEST-003 only (`fast-check`, dev) |
| Must not weaken | approval boundary, default-off gates, service-role/anon split — all tasks, stated in each file |

## Suggested lanes for parallel agents
- **Lane A (truth):** CRON-002
- **Lane B (stack/C1):** STACK-001 → EXP-001 → TEST-003
- **Lane C (search+e2e, C2/C3):** SEARCH-002 → A11Y-001 → EXP-002
- **Lane D (independent):** REL-001 → REL-002 → SEO-002 → PERF-001
- **Lane H (human/ops):** CRON-003

Lanes are mutually conflict-free; within a lane, order as listed. See MANAGER-WORKER-GUIDE.md for hand-off mechanics.
