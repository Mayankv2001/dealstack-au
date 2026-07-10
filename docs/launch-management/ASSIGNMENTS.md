# DealStack AU — Launch Task Assignments

> Maintained by the launch manager (Fable 5). One row per task; ops items live in
> [`LAUNCH-BACKLOG.md`](LAUNCH-BACKLOG.md) because they need a human, not a model.

## Assignment table

| Task | Worker | Branch/worktree | Status | Depends on | Commit | Manager review |
|---|---|---|---|---|---|---|
| TASK-001 pin `set_updated_at` search_path | Claude Sonnet | sequential on `main` | APPROVED | — | `37854b0` | [APPROVED](reviews/REVIEW-TASK-001.md) 2026-07-11 — prod application still pending (human step) |
| TASK-002 operator env docs accuracy | Claude Sonnet (actual; Haiku recommended) | sequential on `main` | APPROVED | — | `8213003` | [APPROVED](reviews/REVIEW-TASK-002.md) 2026-07-10 |
| TASK-003 `/deals` disclaimer wording | Claude Haiku | `task/003-deals-copy` (or sequential on `main`) | READY | — | — | pending |

## Dispatch order and parallelism

- **Recommended sequence (single shared working tree):** TASK-002 → TASK-001 → TASK-003, one at a time, each reviewed before the next starts. All three are Small; total worker time is short, so sequential is the low-risk default.
- **Safe parallel group:** {TASK-001, TASK-002, TASK-003}. They have **zero file overlap** (001: `supabase/migrations/`, `scripts/schema-manifest.ts`, two doc files; 002: `README.md`, `.env.example`; 003: `components/DealsClient.tsx`). Parallel execution is permitted **only** with one branch/worktree per worker — never two models editing the same working tree.
- No task modifies the same database boundary, publication boundary, shared types, or migration as another (TASK-001 is the only migration task).

## Rules of engagement

1. A worker gets exactly one task file + its matching prompt (`prompts/PROMPT-TASK-XXX.md`). Send the prompt content as the worker's instructions.
2. Workers must not begin a different backlog task, expand scope, or rewrite acceptance criteria.
3. On completion, the manager reviews per Phase 7 (repository evidence, not worker summaries) and writes `reviews/REVIEW-TASK-XXX.md`.
4. REVIEW_FAILED → correction task `TASK-XXX-FIX-NN-*.md`; original valid work is preserved.
5. Only the manager flips a task to APPROVED, and only after running the verification commands personally.

## Log

| Date | Event |
|---|---|
| 2026-07-10 | Backlog created at commit `1fae4ed`; TASK-001/002/003 authored and READY; no work dispatched yet. |
| 2026-07-10 | TASK-002 implemented by worker (Claude Sonnet, commit `8213003`, sequential on `main`). Manager review: all 5 acceptance criteria PASS, verification re-run, scope clean → **APPROVED** ([REVIEW-TASK-002](reviews/REVIEW-TASK-002.md)). TASK-001 and TASK-003 remain READY; next dispatch per recommended sequence: TASK-001 (Claude Sonnet, `PROMPT-TASK-001.md`). |
| 2026-07-11 | TASK-001 implemented by worker (Claude Sonnet, commit `37854b0`, sequential on `main`). Manager review: all 6 acceptance criteria PASS; full gate re-run (lint, 114+203+166 tests, build); read-only prod probe confirms `set_updated_at.proconfig` still NULL — worker made no production write → **APPROVED** ([REVIEW-TASK-001](reviews/REVIEW-TASK-001.md)). Follow-up: human-authorised prod application of migration 008. Remaining dispatch: TASK-003 (Claude Haiku, `PROMPT-TASK-003.md`). |
