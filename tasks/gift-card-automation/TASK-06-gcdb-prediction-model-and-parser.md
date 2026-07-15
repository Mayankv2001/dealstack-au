# TASK-06 — GCDB prediction model, parser, and isolation guarantees

## Goal
Parse GCDB's gift-card offer predictions into the isolated prediction table
shape (029) with hard guarantees that predictions never surface as offers.

## Scope
- New `lib/giftcards/parsePredictions.ts`: pure parser from a captured HTML
  snapshot (fixture) of
  `https://gcdb.com.au/predictions/` to prediction
  records: predicted seller, promotion text, start/end dates, families,
  promotion type, value (%/multiplier/fixed points/fee waiver), source URL,
  source last-updated. Emoji/result markers (`✅`/`❌`) map to outcomes ONLY
  via an explicit, documented interpretation table in the module docstring,
  derived from the page's own legend; anything unmapped → `pending` with the
  raw marker preserved in `comparison_notes`.
- No confidence score is inferred — only captured if GCDB states one.
- Repo functions (service-role) to upsert predictions keyed on a stable
  fingerprint (seller + families + predicted window), preserving existing rows
  (outcome fields update; original predicted fields never overwritten).
- Wire `reconcilePredictions` (TASK-04) results into outcome updates +
  `linked_offer_id` on match; matched predictions retain their row.
- **Isolation proofs:** add a test asserting no module under `lib/repos/`,
  `lib/decision/`, `lib/stack/`, `lib/giftcards/publicQuery.ts`,
  `weeklyOffers.ts`, or `marquee.ts` imports the prediction repo/parser; and a
  repo-level test that prediction records cannot appear in any function that
  feeds active surfaces.
- Admin-assisted capture path: predictions enter via pasted/uploaded snapshot
  (same raw-item pattern) because automated fetch is not yet permitted
  (TASK-01 outcome governs).

## Files likely involved
`lib/giftcards/parsePredictions.ts` (new),
`lib/admin/repos/giftCardPredictions.ts` (new),
`tests/giftcards/parsePredictions.test.ts`,
`tests/giftcards/predictionIsolation.test.ts` (new),
`tests/fixtures/gcdb-predictions.html` (new — genuinely captured, trimmed).

## Dependencies
TASK-02 (029 shape). TASK-04 provides `reconcilePredictions`. Wave 1
(parser/tests can start immediately against the fixture).

## Inputs
Plan §7; a manually captured snapshot of the predictions page (capture it
via the browser; store trimmed HTML — no images/scripts).

## Exact deliverables
Parser + repo + isolation tests + fixture.

## Constraints
- Prediction rows never written to `gift_card_offers`.
- Fixture must be a real capture, trimmed; no synthetic prediction content.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Parser field extraction incl. unknown-marker handling; fingerprint stability;
match/miss/partial outcome recording preserves original prediction; isolation
tests above; predicted rows excluded from planner/search fixtures.

## Acceptance criteria
Isolation tests fail if anyone later imports predictions into a public
surface; no invented interpretation of markers.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Public predictions page (deferred; separate approval); automated fetching;
admin UI (TASK-14).
