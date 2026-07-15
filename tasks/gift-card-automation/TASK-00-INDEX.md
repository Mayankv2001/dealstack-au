# Gift-card automation programme — task index and dependency graph

Programme plan: `PLAN-gift-card-end-to-end-automation.md` (repo root).
Manager: engineering-manager agent. Workers: one smaller coding agent per task.

## Standing constraints for EVERY worker (repeated in each task file)

- **Do not commit, push, apply migrations, change production data, or enable
  any ingestion/source/env gate.** Leave changes in the working tree.
- Run on **Node 20** (`nvm use 20`). Australian spelling in user-facing copy.
- Inspect the listed files before editing. Do not broaden your scope.
- Never invent offers, dates, acceptance, MCCs, denominations, limits, URLs,
  or evidence. Unknown stays unknown/null with honest fallbacks.
- Additive schema only; RLS default-deny; staged data is service-role only.
- Read `node_modules/next/dist/docs/` before framework-level code (AGENTS.md).

## Dependency graph

| Task | Prerequisites | Parallel-safe with | Migration dep | Risk | Suggested worker model | Review gate |
|---|---|---|---|---|---|---|
| 01 source policy & adapter states | — | 02, 16a | none | Low | small | docs accuracy vs live robots/terms |
| 02 migration design & authoring (028–030) | plan approval | 01, 16a | authors, never applies | **High** | large | manager + user schema review |
| 03 offer lifecycle & activation | 02 reviewed | 04, 06, 07, 08 | 023 (code-level) | Med | mid | date-boundary tests |
| 04 daily reconciliation engine (pure) | 02 reviewed | 03, 06, 07, 08 | 023 | **High** | large | outcome-taxonomy coverage |
| 05 orchestration routes & workflows | 03, 04 | 09, 10 | 023, 030 | Med | mid | idempotency/lock/auth tests |
| 06 prediction model & parser | 02 reviewed | 03, 04, 07, 08 | 029 | Med | mid | isolation proofs |
| 07 product catalogue | 02 reviewed | 03, 04, 06, 08 | 028 | Low | small | no-invented-data check |
| 08 acceptance model & staging | 02 reviewed | 03, 04, 06, 07 | 028 | **High** | large | vocabulary + RLS review |
| 09 acceptance ingestion & alias resolution | 08 | 05, 10 | 028 | **High** | large | no auto-merge; unresolved flagged |
| 10 acceptance reconciliation & history | 08, 09 | 05 | 028 | Med | mid | removal-preserves-history tests |
| 11 search merchant resolution & planner candidates | 03, 08 | 12 | 028 | Med | large | deterministic-ranking tests |
| 12 compatibility & excluded reasons | 11 | 13 | none | Med | mid | acceptance≠compatibility proof |
| 13 public surfaces | 11, 12 (+06 if predictions page approved) | 14 | 025, 028 | Med | mid | trust-wording review |
| 14 admin review extensions | 04, 08, 06 | 13 | 028, 029 | Med | large | audit coverage |
| 15 monitoring & health | 05, 10 | 16 | none | Low | small | failure-mode distinction tests |
| 16 E2E, DST & scenario tests | all functional tasks (16a scaffolding: none) | 15 | applied schema for e2e-DB mode | Med | large | full-gate green |
| 17 rollout & recovery docs | all | — | none | Low | small | stage-order fidelity |

## Execution waves

- **Wave 0 — now:** 01, 02, 16a (DST/idempotency test scaffolding on existing modules).
- **Wave 1 — after migration design review:** 03, 04, 06, 07, 08 (parallel-safe: disjoint files).
- **Wave 2:** 05, 09, 10.
- **Wave 3:** 11, 12.
- **Wave 4:** 13, 14.
- **Wave 5:** 15, 16, 17.

Hard gates: no Wave-1+ merge into a deployable state until the user approves
applying migrations 023–027 (+028–030 once authored). No source/env gate is
ever opened by a worker.

## Manager review checklist (applied after every task)

1. Read the complete diff.
2. Scope compliance — only listed files/areas touched.
3. Invented-evidence scan — every fact traceable to input data or fixture.
4. Run the task's focused test command(s).
5. Reject incomplete/unsafe work with correction notes.
6. Mark complete only after validation passes.
