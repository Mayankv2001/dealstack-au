# ADR-001 — One source of truth for stacking maths

## Status
Proposed

## Context
Two independent stacking implementations coexist: `lib/stack/buildStack.ts` (the full engine: caps, minimum spend, uses-per-customer, denominations, confidence, verified-vs-total split) and `lib/calculateStack.ts` (92-line percentage model driving `DealStackCalculator`). They can produce different totals for the same store and spend — most visibly whenever a cashback cap binds. The product's stated principle is clear separation of confirmed facts from estimates; two unexplained numbers violates it. Full detail and evidence: `tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md`, `docs/audit/PUBLIC-UX-AUDIT.md` UX-F2.

## Decision
Proposed: **Option B now, Option A when the calculator next gains features.**

- Option B (immediate): keep `calculateStack` as the calculator's maths but label its output visibly as a simplified estimate, with a link to the store's engine-backed verified stack.
- Option A (target state): the calculator constructs a real engine input and renders engine output; `calculateStack.ts` becomes a wrapper or is deleted.

Rationale for phasing: Option B is a one-session, zero-risk honesty fix; Option A changes the calculator's input model (needs store/offer selection to be meaningful) and deserves its own design pass rather than being smuggled in.

## Alternatives considered
- **Do nothing:** rejected — silent disagreement between two first-party numbers is the worst trust outcome.
- **Delete the calculator:** rejected — it serves store-less "what if" exploration that the engine's offer-bound model can't; CLAUDE.md also forbids removing features without explicit requirement.
- **Port caps/min-spend into `calculateStack`:** rejected — creates a third partial engine and doubles the maintenance surface; convergence should be by reuse, not reimplementation.

## Consequences
- Until Option A, the calculator remains simplified but honestly labelled; the agreement test in TASK-STACK-001 pins the uncapped case so the two implementations cannot drift silently.
- The engine remains the only place cap/condition semantics live.

## Risks
- Label fatigue: an over-hedged calculator reads as untrustworthy. Keep the label short and specific ("real offers may have caps and minimums").
- Option A later changes calculator UX; scope it deliberately (new decision or task at that time).

## Follow-up tasks
- `tasks/deal-engine/TASK-STACK-001-unify-calculator-maths-or-label-estimate.md` (implements Option B; records if owner opts straight for A).
- `tasks/testing/TASK-TEST-003-stack-engine-property-tests.md` (pins both implementations' invariants).
