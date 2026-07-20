# TASK-TEST-003 — Property-based invariants for the stacking maths

## Status
Planned

## Priority
P2

## Workstream
TEST

## Problem statement
The stack engine's tests (20 files under `tests/stack/`) are example-based. The engine's honesty guarantees — the reason customers can trust the numbers — are invariants over the whole input space, and nothing pins them as such. A future edit could preserve every example while breaking an invariant on unexercised shapes (odd caps, tiny spends, denomination edges, zero prices).

Invariants worth pinning (from `lib/stack/buildStack.ts` documented semantics and `lib/calculateStack.ts`):

1. `finalEffectivePrice ≥ 0` for all valid inputs (negative-price protection).
2. `payAtCheckout = effectivePrice + cashbackLater` (identity, engine).
3. `verifiedSaving ≤ totalSaving` (engine).
4. Points value never reduces the cash price (engine).
5. `calculateStack`: `excludedLayer` non-null only when both gift-card saving and cashback are positive and the exclusivity flag is set; totals always internally consistent (`totalSaving = originalPrice − finalEffectivePrice` before rounding drift > 1c never occurs).
6. Monotonicity: increasing a discount percentage never increases `finalEffectivePrice` (both implementations).

Classification: Enhancement (test coverage). DS-096 covers gift-card valuation formulas; this task extends the approach to `buildStack`/`calculateStack` and does not duplicate it.

## User impact
Indirect: guards the core truthfulness promises against regression.

## Evidence
- `tests/stack/` — example-based (grep shows no property/generator usage; no fast-check in `package.json`).
- `docs/audit/TEST-COVERAGE-AUDIT.md` gaps list; `docs/audit/DATA-QUALITY-AUDIT.md` invariants section.

## Root cause or likely cause
Property testing was never introduced; the suite grew example-by-example with features.

## Scope
- Add `fast-check` as a devDependency (the one allowed new dependency; it is dev-only).
- New `tests/stack/properties.calculateStack.test.ts` and `tests/stack/properties.buildStack.test.ts` implementing the six invariants with bounded, realistic generators (prices 0–20k, percents 0–100, caps/min-spends optional, denominations from a small set; reuse existing fixture builders where the engine input is complex — grep `tests/stack/` for builder helpers first).
- Seed and numRuns pinned for determinism in CI (`fc.assert(..., { seed, numRuns: 200 })` or config equivalent) — CI must not flake.
- Any invariant violation found is a REAL finding: do not weaken the property to pass; report it and stop (fixing the engine is a separate task unless the fix is a one-liner whose intent is unambiguous).

## Out of scope
- Refactoring the engine; changing rounding.
- Gift-card valuation properties (DS-096).
- Calculator/engine unification (TASK-STACK-001).

## Relevant files
- `package.json` (devDependency), `tests/stack/properties.*.test.ts` (new)
- Read-only: `lib/stack/buildStack.ts`, `lib/calculateStack.ts`, existing fixture builders

## Data and schema considerations
None.

## Security considerations
None.

## Implementation plan
1. Install fast-check (dev). Confirm licence (MIT) and zero runtime impact.
2. calculateStack properties first (simple input space), then buildStack via existing builders.
3. Run with elevated numRuns locally once (e.g. 2000) to shake out edges, then pin CI-friendly numRuns.

## Required tests
The property files; entire `npm run test:stack` green.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:stack && npm run build
```

## Manual verification
None beyond test output.

## Production safety
Dev-dependency + tests only.

## Dependencies
None hard. Coordinate with TASK-STACK-001/TASK-EXP-001 (same modules under test) — see Parallelisation.

## Parallelisation notes
Do not run concurrently with TASK-STACK-001 or TASK-EXP-001 (their changes alter expected warning/shape behaviour); run after them if all three are scheduled.

## Rollback or recovery
Revert commit (removes dep + tests).

## Acceptance criteria
- Six invariants pinned deterministically; suite green; any violation found reported as a finding rather than papered over.

## Definition of done
Criteria met; report includes numRuns/seed choices and any engine findings.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `lib/calculateStack.ts`, the output-assembly and warning sections of `lib/stack/buildStack.ts`, and existing `tests/stack/` fixture builders.
2. Verify no property tests already exist (grep fast-check). Confirm whether TASK-STACK-001/TASK-EXP-001 have landed — if they changed semantics, encode the CURRENT semantics.
3. Check `git status`; preserve unrelated work. Use Node 20.

During implementation:
- Deterministic seeds; bounded realistic generators; never weaken a property to make it pass — a violation is a finding to report.
- fast-check (dev) is the only permitted new dependency. Do not commit, push, migrate, or deploy.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:stack && npm run build`.
- Report files added, seeds/numRuns, elevated-run results, and any invariant violations found (with minimal reproducing input).
