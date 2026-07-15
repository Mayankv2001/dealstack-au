# TASK-12 — Compatibility integration and excluded reasons

## Goal
Ensure the gift-card layer's stack-compatibility verdicts stay honest and
evidence-based when driven by the new acceptance data, and that every
excluded option explains itself.

## Scope
- Extend `lib/giftcards/compatibility.ts` / `stackability.ts` inputs to
  consume acceptance-derived facts (channel, MCC restrictions, purchase vs
  redemption stage) without changing the five-status vocabulary
  (`compatible`, `likely-compatible`, `incompatible`,
  `requires-verification`, `insufficient-evidence`).
- Dimensions covered (only where structured evidence exists — otherwise
  `insufficient-evidence`): cashback gift-card exclusions, promo-code payment
  restrictions, online vs in-store use, gift-card purchase vs redemption
  stages, card-linked-offer restrictions, split payment, MCC, minimum spend,
  balance/number-of-cards limits, points eligibility.
- **Acceptance ≠ compatibility**: a helper-level guarantee (and test) that
  merchant acceptance alone can never produce `compatible` — at most
  `likely-compatible` with the reason naming what remains unverified.
- Excluded-reason strings: one module-level catalogue of truthful reason
  templates (Australian English), consumed by `DecisionResult.warnings` /
  option `compatibilityReason` — no free-form strings scattered in the
  builder.

## Files likely involved
`lib/giftcards/compatibility.ts`, `lib/giftcards/stackability.ts`,
`lib/stack/compatibility.ts` (read; touch only if an interface must widen),
`lib/decision/buildDecisionResult.ts` (wire reasons),
`tests/giftcards/compatibility.test.ts`, `stackability.test.ts` (extend).

## Dependencies
TASK-11. Wave 3.

## Inputs
Plan §8; existing five-status engine and its tests.

## Exact deliverables
Extended engine inputs + reason catalogue + tests.

## Constraints
- Vocabulary unchanged; no sixth status; no boolean "stackable" anywhere.
- No compatibility claim without structured evidence for that dimension.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Acceptance-only input → never `compatible`; each dimension flips the verdict
only with evidence present; reason strings match the catalogue; stack suite
(`test:stack`) unaffected.

## Acceptance criteria
`npm run test:stack` fully green (no behavioural regressions); every excluded
option in decision fixtures carries a catalogued reason.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npm run test:stack && npm run test:decision && npx tsc --noEmit`

## Non-goals
Ranking (TASK-11); UI copy placement (TASK-13).
