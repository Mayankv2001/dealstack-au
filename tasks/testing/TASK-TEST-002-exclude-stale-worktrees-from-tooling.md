# TASK-TEST-002 — Make vitest, ESLint and tsc ignore `.claude/worktrees/` so local validation tells the truth

## Status
Done — `eslint.config.mjs` and `vitest.config.ts` both exclude `.claude/worktrees/**`. Verified 2026-07-22 by reading the configs directly (worktree directories are still present on disk but no longer poison tooling output).

## Priority
P1

## Workstream
TEST — testing & CI integrity

## Problem statement
Agent worktrees checked out under `.claude/worktrees/` are inside the repository directory, and none of the three main validation tools exclude them:

- `npx vitest run` → 62 failures / 21 failing files, **all** under `.claude/worktrees/**` (real `tests/` tree green). Even `npx vitest run tests` fails identically because the CLI arg is a substring filter and worktree paths contain `/tests/`.
- `npm run lint` → 2,512 errors / 29,757 warnings, 100% of flagged files under `.claude/worktrees/**`.
- `tsconfig.json` includes `**/*.ts` with only `node_modules` excluded, so `tsc` also compiles worktree copies (slower; can surface phantom errors when worktrees diverge).

The CLAUDE.md commit checklist ("`npm run lint` must pass") is currently unsatisfiable on a machine with stale worktrees, and the backlog's standard validation command (`npx vitest run`) reports false failures.

Classification: Confirmed defect (all three commands run 2026-07-19; failure paths grouped and verified 100% worktree-local).

## User impact
Indirect but serious: false-red validation makes agents and humans either "fix" phantom breakage in stale copies or learn to ignore red output — both erode the safety net protecting price accuracy and the approval boundary.

## Evidence
- `vitest.config.ts` — `exclude: ["tests/e2e/**", "**/node_modules/**", "**/.git/**"]` (no worktree pattern).
- `eslint.config.mjs` — `globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"])`.
- `tsconfig.json` — `"include": ["**/*.ts", ...]`, `"exclude": ["node_modules"]`.
- Session command outputs summarised in `docs/audit/TEST-COVERAGE-AUDIT.md` (TC-F2).
- `git worktree list` shows `.claude/worktrees/focused-fermi-faf446` (at `8dd611d`) and `wizardly-haibt-f03b79` (at `c00d1a1`).

## Root cause or likely cause
The worktree convention (agent sessions with `isolation: worktree`) postdates the tooling configs; nothing was ever taught to skip `.claude/`.

## Scope
1. `vitest.config.ts`: add `"**/.claude/**"` to `test.exclude`.
2. `eslint.config.mjs`: add `".claude/**"` to `globalIgnores`.
3. `tsconfig.json`: add `".claude"` to `exclude`.
4. Playwright: confirm `testDir: "tests/e2e"` already scopes it (it does — document in the PR notes, no change).
5. After the excludes work, evaluate replacing the six per-suite CI vitest lines with a single `npx vitest run` in `ci.yml` so new `tests/<area>` folders can never silently skip CI (see TEST-COVERAGE-AUDIT "CI suite drift risk"). Keep this a separate commit within the task so it can be reverted independently.
6. Document worktree hygiene in `CONTRIBUTING.md` (one short paragraph): stale worktrees are removed with `git worktree remove <path>` after confirming no uncommitted work (`git -C <path> status`).

## Out of scope
- Actually deleting the two stale worktrees on the author's machine (machine-local; flagged for the maintainer — one of them may hold in-progress work, and this repo has a recorded concurrent-session hazard).
- Fixing the real `tests/decision` type errors (TASK-TEST-001).

## Relevant files
- `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `.github/workflows/ci.yml`, `CONTRIBUTING.md`

## Data and schema considerations
None.

## Security considerations
None. (Excluding `.claude/` from lint/type tooling does not exclude it from git — worktree contents were never committed.)

## Implementation plan
1. Reproduce all three false-failure outputs (skip any already clean).
2. Apply the three config excludes.
3. Re-run: `npx vitest run` must now execute only the ~143 real files; `npm run lint` and `npx tsc --noEmit` must be clean (tsc: after TASK-TEST-001, or report its 2 known real errors as expected).
4. Optionally consolidate CI vitest invocation; run the full CI command list locally.
5. Add the CONTRIBUTING paragraph.

## Required tests
- No new unit tests. The validation IS the test: file-count and pass/fail deltas before/after, reported explicitly.

## Validation commands
```bash
npx vitest run              # expect ~143 files, 0 failures from worktrees
npm run lint                # expect clean
npx tsc --noEmit            # clean (or only TASK-TEST-001's known errors if run first)
npm run build
```

## Manual verification
`git worktree list` + confirm excluded dirs still exist untouched.

## Production safety
Config-only; no runtime behaviour change; no production interaction.

## Dependencies
None hard. Sequence with TASK-TEST-001 (either order) so the final state is a fully green local gate.

## Parallelisation notes
Touches three root configs — do not run concurrently with any other task editing those files (none in this programme does). Safe alongside all content/lib tasks.

## Rollback or recovery
Revert the config diffs. The CI consolidation commit (if made) reverts independently.

## Acceptance criteria
- Root-run vitest/lint/tsc report zero findings originating under `.claude/`.
- Real-tree results unchanged (same pass counts as scoped runs).
- CI still runs every suite (verified by CI logs or local execution of the workflow's command list).
- CONTRIBUTING documents worktree hygiene.

## Definition of done
All criteria met; before/after counts reported; no worktree contents modified or deleted.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file.
2. Inspect `vitest.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `.github/workflows/ci.yml`.
3. Verify the issue still exists: run `npx vitest run` and confirm failures (if any) come from `.claude/worktrees/**`.
4. Check `git status`; preserve unrelated work; do NOT touch anything inside `.claude/worktrees/` — those may hold another session's work.

During implementation:
- Make the three config excludes; keep the optional CI consolidation as its own commit-sized change; add the CONTRIBUTING paragraph.
- Do not delete worktrees. Do not perform unrelated refactoring.
- Do not commit, push, migrate, deploy, publish offers, or change production data.

After implementation:
- Run the validation commands; report before/after file and failure counts, every changed file, and anything left unverified.
