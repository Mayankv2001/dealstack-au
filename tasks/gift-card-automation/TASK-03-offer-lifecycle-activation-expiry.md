# TASK-03 — Offer lifecycle: activation, expiry archival, history sealing

## Goal
Pure, injectable-clock lifecycle engine deciding which approved offers
activate, which expire out of active surfaces, and which occurrences to seal
into history — acting on admin-approved data only.

## Scope
- New `lib/giftcards/lifecycle.ts` (pure): given canonical offers + a Sydney
  local date (derive via the `Intl` pattern in `schedule.ts`), return
  `{ toActivate, toArchive, upcoming, unknownDate }` where:
  - activate: approved/published rows with `start_date ≤ today` not yet active;
  - archive: rows whose confirmed end (`expiry_date`/`expiry_time`) has passed;
  - upcoming: `start_date > today` — must NOT appear active;
  - unknown-date: never treated as confirmed current for ranking purposes.
- Extend `lib/giftcards/dateState.ts` / `publishReadiness.ts` only as needed
  so public read paths (`lib/repos/offers.ts` gift-card path,
  `publicQuery.ts`) exclude `upcoming` rows from active views. Inspect the
  current RLS/read guards first — reuse, don't duplicate.
- Archival calls the existing occurrence-snapshot path
  (`offerOccurrenceSnapshot.ts`, `history.ts`) to seal history rows; never
  deletes an offer row.
- Repo functions in `lib/admin/repos/giftCardPipeline.ts` (or a sibling) to
  apply lifecycle decisions transactionally (service-role), each write
  audit-logged.

## Files likely involved
`lib/giftcards/lifecycle.ts` (new), `dateState.ts`, `publishReadiness.ts`,
`publicQuery.ts`, `lib/repos/offers.ts`, `lib/giftcards/history.ts`,
`offerOccurrenceSnapshot.ts`, `lib/admin/repos/giftCardPipeline.ts`,
`tests/giftcards/lifecycle.test.ts` (new).

## Dependencies
TASK-02 design review. Uses 023 columns (`start_date`, `is_ongoing`) and 025
occurrences — code must degrade honestly (`?? null` pattern) where columns are
absent. Wave 1; parallel-safe with 04/06/07/08.

## Inputs
Plan §5 step 2–3, §13; existing `dateState.ts`, `schedule.ts`,
`tests/stack/factories.ts` fixed-clock pattern.

## Exact deliverables
Lifecycle module + repo apply functions + tests. No route (TASK-05 wires it).

## Constraints
- Injectable `now`/`today` everywhere; no `Date.now()` in pure logic.
- Only admin-approved rows change visibility; no candidate is ever published.
- Missing expiry ≠ expired and ≠ ongoing; `is_ongoing=true` never archives.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Boundary tests: activates exactly on start date (Sydney date, not UTC);
archives only after confirmed end; upcoming hidden; unknown-date excluded from
"confirmed current"; ongoing never archived; idempotent re-run (second call
returns empty sets); DST-boundary date derivation.

## Acceptance criteria
All above tests green; no public surface change except upcoming-row exclusion;
no destructive deletes anywhere in the diff.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Cron routes/workflows (TASK-05); reconciliation diffing (TASK-04); UI.
