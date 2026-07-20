# ADR-002 — Agent worktree hygiene and tooling exclusion

## Status
Proposed

## Context
Agent sessions create git worktrees under `.claude/worktrees/` inside the repository. Two stale ones (at commits `8dd611d` and `c00d1a1`) currently poison every repo-root validation command: `npx vitest run` reports 62 false failures, `npm run lint` ~2.5k false errors, and `tsconfig.json`'s `**/*.ts` include drags them into typechecking. The CLAUDE.md commit checklist ("lint must pass") is unsatisfiable locally while any stale worktree exists. Evidence: `docs/audit/TEST-COVERAGE-AUDIT.md` TC-F2. A related hazard is on record (memory: concurrent sessions mutating the tree mid-task).

## Decision
Proposed, two parts:

1. **Tooling excludes the worktree root permanently.** `vitest.config.ts`, `eslint.config.mjs`, and `tsconfig.json` all exclude `.claude/worktrees/**`. Validation commands must judge only the canonical tree. (Implementation: TASK-TEST-002, which also considers replacing `ci.yml`'s six enumerated suites with one root `npx vitest run` once the exclusion makes that trustworthy.)
2. **Worktrees are ephemeral by convention.** A worktree that is done is removed (`git worktree remove`, or `git worktree prune` after deletion); sessions should not leave worktrees behind on exit, and any human noticing a stale one may remove it after confirming `git -C <worktree> status` shows no unique uncommitted work.

## Alternatives considered
- **Move worktrees outside the repo** (e.g. `/private/tmp`): cleaner but not under our control — the harness chooses the location; excluding is robust either way.
- **Gitignore only:** `.claude/worktrees` being ignored by git does not stop vitest/eslint/tsc from walking the directory; tool-level exclusion is required.
- **Manual cleanup discipline alone:** already failed twice; configs must not depend on it.

## Consequences
- Local and CI validation reflect only the real tree; the commit checklist becomes satisfiable.
- Work inside a worktree is validated from within that worktree (its own root), which is already how agent sessions operate.

## Risks
- Exclusion could mask a worktree accidentally holding the only copy of real work — hence the status-check-before-removal rule in part 2.

## Follow-up tasks
- `tasks/testing/TASK-TEST-002-exclude-stale-worktrees-from-tooling.md` (config changes + hygiene documentation).
