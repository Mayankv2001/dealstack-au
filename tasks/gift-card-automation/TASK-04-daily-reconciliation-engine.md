# TASK-04 — Daily reconciliation engine (pure)

## Goal
A pure engine that compares canonical gift-card offers with the latest
approved-source state and emits the full outcome taxonomy — without writing
anything itself.

## Scope
- New `lib/giftcards/reconcileOffers.ts`: inputs = canonical offers, latest
  parsed source items (per source), previous raw-item fingerprints, injectable
  clock. Output = per-offer outcome list:
  `new-offer | unchanged | material-change | date-extension | date-reduction |
  changed-limit | changed-denomination | changed-cards | changed-seller |
  changed-value | changed-points-multiplier | changed-exclusions |
  changed-retailer-evidence | withdrawn | expired | source-unavailable |
  parse-failure | possible-duplicate | acceptance-change-hint` plus a
  machine-readable summary.
- Material-vs-non-material classification MUST reuse/extend
  `lib/giftcards/classifyChange.ts` — do not fork the logic. Material changes
  produce **changed candidates** (existing queue shape) via a mapping helper;
  non-material produce auto-refresh instructions (last-seen/etag only).
- Withdrawal vs disappearance: explicit source statement of removal →
  `withdrawn`; mere absence → `source-unavailable` outcome that sets
  `source_present=false` intent (023 column) and raises a review flag — it
  never expires or unpublishes anything by itself.
- Confirmed expiry (end date passed per source or per canonical date) →
  `expired` outcome consumed by TASK-03's archive path.
- Duplicate detection reuses `duplicateDetection.ts` verdicts (advisory).
- Prediction comparison hook: expose a separate pure function
  `reconcilePredictions(predictions, confirmedOffers)` returning
  `exact-match | partial-match | different-value | different-family |
  different-seller | different-dates | no-promotion | did-not-occur |
  pending` (consumed by TASK-05/06; no DB writes here).

## Files likely involved
`lib/giftcards/reconcileOffers.ts` (new),
`lib/giftcards/reconcilePredictions.ts` (new), `classifyChange.ts` (extend),
`tests/giftcards/reconcileOffers.test.ts`,
`tests/giftcards/reconcilePredictions.test.ts` (new).

## Dependencies
TASK-02 design review (uses 023 field names; degrade honestly if absent).
Wave 1; parallel-safe with 03/06/07/08.

## Inputs
Plan §4–5; `classifyChange.ts`, `duplicateDetection.ts`, candidate shape in
`lib/admin/repos/giftCardPipeline.ts`.

## Exact deliverables
Two pure modules + exhaustive tests. No route, no repo writes.

## Constraints
- Pure functions, injectable clock, no I/O.
- Public truth is never overwritten by an outcome — material changes only ever
  become reviewable candidates.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
One test per outcome in both taxonomies; source-missing ≠ expiry; material
change produces a candidate payload with a field-level diff; non-material
produces no candidate; idempotency (same inputs twice → identical output, no
new candidates flagged on re-run given unchanged fingerprints).

## Acceptance criteria
Every outcome reachable and tested; zero writes in the module; diff shows
`classifyChange.ts` reused, not duplicated.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Cron route/locking (TASK-05); acceptance reconciliation (TASK-10); admin UI.
