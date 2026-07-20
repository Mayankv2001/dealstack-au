# TASK-STACK-001 — One source of stacking truth: reconcile the calculator with the stack engine

## Status
Planned

## Priority
P1

## Workstream
STACK — deal engine & price truthfulness

## Problem statement
The site ships two independent stacking implementations that can disagree for the same store and spend:

- `lib/stack/buildStack.ts` (952 lines) — the real engine: honours cashback caps, minimum spend, uses-per-customer, gift-card denominations, verified-vs-total saving split, pay-at-checkout vs cashback-later, per-layer confidence and warnings.
- `lib/calculateStack.ts` (92 lines) — the homepage `DealStackCalculator` maths: three raw percentages plus one exclusivity flag. No caps, no min-spend, no denominations, no uses-per-customer, no confidence.

A shopper who reads a featured stack (engine numbers) and then plugs the same store into the calculator can get a different "final effective price" — e.g. any store whose cashback offer has a cap the spend exceeds. Nothing in the calculator UI states that it is a simplified estimate. This violates the product's core principle: clear separation between confirmed facts and estimates.

Classification: Design weakness (confirmed divergence in code; user-visible disagreement depends on offer shapes that exist — capped cashback offers are common).

## User impact
The two numbers the product shows for the same purchase can disagree with no explanation, undermining trust in the surface whose whole job is trustworthy arithmetic.

## Evidence
- `lib/calculateStack.ts:39-86` — full implementation: `clampPercent` on three percentages, sequential multiply, exclusivity picks the larger of gift-card saving vs cashback. No cap/min-spend/denomination inputs exist in `StackInput`.
- `lib/stack/buildStack.ts` — cap/min-spend/denomination handling (search `cap`, `minSpend`, `denomination`).
- `components/DealStackCalculator` usage of `calculateStack` (homepage + calculator surfaces).
- Cross-refs: `docs/audit/PUBLIC-UX-AUDIT.md` UX-F2; `docs/audit/CURRENT-STATE-AUDIT.md` design-weakness list; ADR-001 (`docs/decisions/ADR-001-single-stacking-maths-source.md`) records the decision options.

## Root cause or likely cause
The calculator predates (or was built alongside) the full engine as a marketing-style illustration and was never reconciled when the engine grew caps and conditions.

## Scope
Decide via ADR-001, then implement ONE of:

- **Option A (preferred if feasible in one session):** make the calculator call the real engine — construct a minimal engine input from the calculator's fields (or from the selected store's live offers) and render engine outputs. Delete or thin `calculateStack.ts` to a wrapper.
- **Option B (fallback):** keep the simple maths but label it honestly — visible "Simplified estimate — real offers may have caps, minimums and conditions; see the store page for the verified stack" copy on every calculator render, plus a link to the store's engine-backed stack when a store is selected.

Either way:
- Add a regression test asserting the two implementations agree for the uncapped/no-min-spend case (they should already; pin it).
- If Option B: add a UI test asserting the estimate label renders.

## Out of scope
- Redesigning the calculator UI beyond the label/link (CLAUDE.md: no page redesigns).
- Changing engine semantics (caps, rounding, exclusivity rules).
- TASK-TEST-003's property tests (separate task; see Parallelisation).

## Relevant files
- `lib/calculateStack.ts`, `lib/stack/buildStack.ts`
- `components/DealStackCalculator*` (locate exact file via grep for `calculateStack`)
- `tests/stack/` (existing calculateStack tests, if any — check `tests/stack/calculateStack*.test.ts`)
- `docs/decisions/ADR-001-single-stacking-maths-source.md`

## Data and schema considerations
None — pure presentation/engine wiring.

## Security considerations
None.

## Implementation plan
1. Read ADR-001; confirm which option the repo owner accepted (if the ADR is still Proposed, implement Option B — it is smaller, honest, and does not foreclose Option A later; note that choice in the report).
2. Failing test first (agreement pin or label render).
3. Implement; keep `formatAUD` export intact (other callers may import it — grep first).
4. Update ADR-001 status if the implementation resolves it.

## Required tests
- Agreement test for the simple case (both options).
- Option A: engine-input construction unit tests (cap present ⇒ calculator output reflects cap).
- Option B: render test for the estimate label; label passes `sanitisePublicText` conventions.

## Validation commands
```bash
npm run lint && npx tsc --noEmit && npm run test:stack && npm run build
```

## Manual verification
Local dev: pick one store with a capped cashback offer; compare featured-stack numbers with calculator numbers for the same spend; confirm they agree (A) or the calculator is clearly labelled an estimate with a working link (B).

## Production safety
No data writes; no cron/approval surface touched. Pure UI/engine change covered by tests in both static and DB modes.

## Dependencies
ADR-001 decision (soft — Option B is the safe default when undecided).

## Parallelisation notes
Touches `lib/stack/` — do not run concurrently with TASK-EXP-001 or TASK-TEST-003; sequence these three in any order.

## Rollback or recovery
Revert commit.

## Acceptance criteria
- A shopper can no longer see two unexplained different totals for the same inputs: either the numbers agree, or the simpler one is explicitly labelled an estimate with a path to the verified stack.
- Tests pin the chosen behaviour.

## Definition of done
Criteria met; validation green; changed files, chosen option, and ADR status reported.

## Implementation-agent prompt

Implement this task completely.

Before editing:
1. Read this task, `docs/decisions/ADR-001-single-stacking-maths-source.md`, `lib/calculateStack.ts`, and the cap/min-spend handling in `lib/stack/buildStack.ts`.
2. Verify the divergence still exists (calculator ignores caps). If it has been fixed, stop and report.
3. Check `git status`; preserve unrelated work.

During implementation:
- Implement the ADR-accepted option; if the ADR is still Proposed, implement Option B and say so.
- Smallest complete change; no calculator redesign; engine semantics untouched.
- Do not commit, push, migrate, deploy, or touch production data.

After implementation:
- Run: `npm run lint && npx tsc --noEmit && npm run test:stack && npm run build`.
- Report the option implemented, changed files, test results, and remaining risks (including any callers of `calculateStack`/`formatAUD` you found beyond the calculator).
