# TASK-TEST-001 — Fix DealsBundle type errors in tests/decision so the CI typecheck gate is green

## Status
Planned

## Priority
P1

## Workstream
TEST — testing & CI integrity

## Problem statement
`npx tsc --noEmit` fails at HEAD (`9b7365f`) with two errors:

- `tests/decision/buildDecisionResult.test.ts(80,3)`: TS2322 — object with `stackData?: StackData | undefined` not assignable to `DealsBundle` (whose `stackData` is required).
- `tests/decision/giftCardRanking.test.ts(8,7)`: TS2741 — `stackData` missing from a `DealsBundle` fixture.

`ci.yml` runs `npx tsc --noEmit` before the test suites, so the next CI run on main should fail. The runtime tests still pass (`npm run test:decision` is green) because vitest does not typecheck — which is how the break slipped in.

Classification: Confirmed defect (reproduced 2026-07-19 by running `npx tsc --noEmit` on Node 20).

## User impact
No direct customer impact. Indirect: a red merge gate blocks every subsequent change from shipping cleanly, and a chronically-red gate trains people to ignore CI — the protection for price-accuracy and approval-boundary code disappears.

## Evidence
- Command output (this audit session): the two TS errors above; exit non-zero.
- `git log` shows `a783e12 feat(deals): Implement merchant layer facts and recommendations` — the change that made `stackData` required on `DealsBundle` (see `lib/deals/load.ts` / `lib/decision/*` types) without updating the two decision-test fixtures.
- `.github/workflows/ci.yml` step `npx tsc --noEmit`.

## Root cause or likely cause
`DealsBundle` gained a required `stackData: StackData` field; the decision tests construct bundles literally and were not updated. Vitest's lack of typechecking hid it locally.

## Scope
- Update the two test fixtures to construct a valid `DealsBundle` (provide a real minimal `StackData` — the empty-arrays shape used by `STATIC_STACK_DATA` in `lib/stack/buildStack.ts` is a good template — or use a shared fixture builder).
- If several decision tests need the same bundle shape, extract one `makeDealsBundle(overrides)` helper inside `tests/decision/` (test-side only).
- Confirm `npx tsc --noEmit` is clean afterwards.

## Out of scope
- Changing `DealsBundle` itself (making `stackData` optional again would re-hide the requirement the app code now relies on).
- Any `lib/` or `app/` change.
- The worktree-pollution problem (TASK-TEST-002).

## Relevant files
- `tests/decision/buildDecisionResult.test.ts`
- `tests/decision/giftCardRanking.test.ts`
- Types: `lib/decision/types.ts`, `lib/deals/load.ts` (read-only reference)
- `lib/stack/buildStack.ts` — `StackData` shape and `STATIC_STACK_DATA` example

## Data and schema considerations
None. Test-only change.

## Security considerations
None.

## Implementation plan
1. Run `npx tsc --noEmit` (Node 20) and confirm the two errors still exist; if they don't, stop and report the task obsolete.
2. Read the current `DealsBundle` definition and the failing fixtures.
3. Add `stackData` (minimal valid `StackData`) to each fixture; prefer a tiny shared builder if used ≥2×.
4. Re-run typecheck and the decision suite.

## Required tests
- Existing: `npm run test:decision` must stay green (2 files).
- No new runtime tests required; the "test" being fixed is the typecheck gate itself.

## Validation commands
```bash
npx tsc --noEmit          # must exit 0
npm run test:decision
npm run lint              # note: currently red from worktree pollution — see TASK-TEST-002; lint your changed files if the full run is polluted
```

## Manual verification
None beyond the commands.

## Production safety
No production interaction. No commit/push/deploy by the agent.

## Dependencies
None. (TASK-TEST-002 makes the *full* local validation honest, but this fix does not depend on it.)

## Parallelisation notes
Touches only `tests/decision/*`; safe alongside anything except another task editing those two files. Ideal first task.

## Rollback or recovery
`git checkout -- tests/decision/` restores the previous state.

## Acceptance criteria
- `npx tsc --noEmit` exits 0 on Node 20 at the task branch.
- `npm run test:decision` green; no other file modified.

## Definition of done
Both criteria met; changed files and command outputs reported; no unrelated diff.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this entire task file.
2. Inspect all referenced files.
3. Verify the two `tsc` errors still exist by running `npx tsc --noEmit` on Node 20 (`nvm use 20`). If they are already fixed, stop and report.
4. Check `git status` and preserve unrelated work.

During implementation:
- Make the smallest complete change: fix the two test fixtures (plus an optional tiny shared builder in `tests/decision/`).
- Do not modify `lib/` or `app/` code, and do not loosen the `DealsBundle` type.
- Do not perform unrelated refactoring.
- Do not commit, push, migrate, deploy, publish offers, or change production data.

After implementation:
- Run `npx tsc --noEmit` and `npm run test:decision`.
- Report the root cause, every changed file, validation output, and anything left unverified.
