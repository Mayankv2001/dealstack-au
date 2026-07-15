# TASK-25 — Reconciliation taxonomy and candidate-mapping closeout

## Goal
Close the missing TASK-04 acceptance criteria without adding I/O to the pure
engine.

## Root cause
The current tests do not prove every declared outcome is reachable, do not
exercise advisory duplicate output or deterministic reruns, and the engine has
no explicit mapping helper that yields the review-candidate payload with a
field-level diff.

## Scope
- Keep `reconcileOffers` and `reconcilePredictions` pure and clock-injected.
- Add an explicit pure material-result-to-candidate mapping compatible with the
  existing gift-card candidate staging boundary.
- Prove every offer and prediction outcome in the TASK-04 taxonomies is
  reachable and correctly classified.
- Test duplicate advisory output, source-missing versus expiry, non-material
  no-candidate behaviour, field-level diff, and identical repeated inputs.

## Files likely involved
`lib/giftcards/reconcileOffers.ts`, `lib/giftcards/reconcilePredictions.ts`,
`tests/giftcards/reconcile.test.ts` or narrowly split focused tests.

## Acceptance criteria
- One focused assertion covers every taxonomy member.
- Material changes produce a private candidate draft with before/after fields.
- Non-material outcomes produce no candidate draft.
- Same inputs and fixed clock produce byte-equivalent results.
- No DB/network/publication import is introduced.

## Safety
No migration edit/apply, production access, commit, push or deployment.
