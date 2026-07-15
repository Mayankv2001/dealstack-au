# TASK-11 — Search merchant resolution and planner gift-card candidates

## Goal
Make store/product search surface every genuinely applicable gift-card option
(the Nike → TCN Shop + TCN Love case) with deterministic, evidence-aware
ranking inside the existing `DecisionResult` pipeline.

## Scope
- Extend `lib/decision/buildDecisionResult.ts`:
  1. Query → canonical merchant via `stores` + aliases (reuse
     TASK-09's resolver / `normalise.ts`).
  2. Direct-issue cards + multi-retailer cards whose approved acceptance
     covers the merchant (`isCurrentlyAccepted`, non-stale, positive statuses
     only; `unofficially-reported` allowed but labelled and ranked below).
  3. Active approved offers for those products (date-valid via TASK-03
     helpers; upcoming/unknown-date excluded from "current").
  4. Channel (online/in-store) surfaced per option; saving via `value.ts`
     (immediate cash strictly separate from points/bonus/later value).
  5. Candidate layer → existing compatibility engine (TASK-12 refines
     reasons).
- Deterministic ranking comparator (pure, exported, unit-tested), applied to
  `RetailerGiftCardOption[]`, ordered exactly: (1) active+approved, (2)
  acceptance confidence tier (official > specialist > unofficial), (3)
  acceptance freshness, (4) direct applicability, (5) plan compatibility,
  (6) immediate cash saving, (7) estimated later value, (8) purchase
  friction (membership/activation/exchange requirements), (9) limits.
  Hard rule with its own test: **a stale unofficial record never outranks a
  current official one.**
- Populate the option's display data: card name, seller, promotion, cash
  paid, card value received, points/later value, max usable amount,
  quantity/denomination requirements, redemption channel, evidence freshness
  + tier label (TASK-08 helper), uncertainty notes, ordered steps (reuse
  `claimSteps.ts` / stack presentation).
- `rankingExplanation` entries describe why each option ranked where it did;
  excluded options carry truthful `warnings`/reasons (feeds TASK-12/13).

## Files likely involved
`lib/decision/buildDecisionResult.ts`, `lib/decision/types.ts`,
`lib/decision/loadDecisionResult.ts`, `lib/giftcards/searchAcceptance.ts`,
`tests/decision/buildDecisionResult.test.ts`,
`tests/decision/giftCardRanking.test.ts` (new).

## Dependencies
TASK-03 (date validity), TASK-08 (acceptance helpers). Wave 3.

## Inputs
Plan §8; existing decision suite; `tests/giftcards/offerFixture.ts`.

## Exact deliverables
Extended decision builder + exported comparator + tests.

## Constraints
- No merchant/product names hard-coded in logic — everything flows from data;
  Nike/TCN appear only in test fixtures.
- Never recommend from unreviewed source text, predictions, stale acceptance,
  or expired/upcoming offers.
- Cash-now vs later-value never summed into one number.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Nike-shaped fixture: two products (TCN Shop, TCN Love) both accepted →
both options returned, channels distinct, deterministic order stable across
input permutations; stale-official-vs-current-unofficial ordering; expired
offer excluded despite valid acceptance; current offer excluded when
acceptance stale (with truthful reason); one-merchant-many-cards and
one-card-many-merchants; ambiguous merchant query → `ambiguous` result, no
recommendation.

## Acceptance criteria
Comparator pure + exported; permutation-stability test green; all exclusion
reasons truthful strings, not booleans.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:decision && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
UI rendering (TASK-13); compatibility-reason vocabulary (TASK-12).
