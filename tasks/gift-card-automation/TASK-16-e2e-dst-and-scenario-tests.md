# TASK-16 — End-to-end, DST, and scenario test suite

## Goal
Prove the five mandated scenarios (plus acceptance/prediction invariants)
end-to-end, including DST correctness and idempotency, at both desktop and
mobile viewports.

## Scope
**16a (Wave 0, no dependencies):** DST + idempotency scaffolding against
existing modules — extend `tests/giftcards/schedule.test.ts` with explicit
AEST (2026-07 dates) and AEDT (2026-11 dates) cases proving: one run per
local day across both UTC trigger slots, no duplicate during the 20:00+21:00
overlap, correct behaviour across the 2026-10-04 AEDT transition; interval
guard tested at 39h59m/40h01m boundaries.

**16b (Wave 5):** scenario suites —
- **Nike scenario** (Vitest, decision suite): fixtures with TCN Shop + TCN
  Love products, current acceptance evidence for a "Nike" store, both with
  active offers → both options appear; online/in-store differences visible in
  the option data; deterministic best option; selected option enters the
  plan; cash vs later value separate; excluded options carry truthful
  reasons.
- **Expiry scenario:** offer active before end time; after clock passes end,
  absent from active views/search/best-verified/expiring; present in
  history; linked plan shows expired warning; row still exists (no delete).
- **Change scenario:** source limit change → reconciliation emits material
  diff → revision candidate created → published row unchanged → evidence and
  audit intact.
- **Source-failure scenario:** one source errors; others complete; approved
  records untouched; health reports partial failure distinctly.
- **Prediction invariants:** predicted rows never in active pages, planner,
  search, weekly, marquee, or best-verified fixtures; matched prediction
  links without overwriting; missed prediction retained.
- **Acceptance invariants:** alias resolution; ambiguity requires review;
  official replaces unofficial (both retained); removed merchant absent from
  new-plan recommendations but in history; expired offer not recommended
  despite valid acceptance; current offer not recommended when acceptance
  stale; purchase vs redemption distinct; no duplicate acceptance rows.
- **Playwright e2e** (`tests/e2e/`): gift-card detail acceptance section,
  where-to-use flow, store-search gift-card options — at 1440×900 and
  390×844, with accessibility checks (roles/names) and a horizontal-overflow
  assertion, static-fallback data mode per `playwright.config.ts`.
- Add `test:giftcards`/`test:decision` to `.github/workflows/ci.yml` if still
  missing (verify first — a prior commit may have added them).

## Files likely involved
`tests/giftcards/schedule.test.ts`, `tests/decision/`, `tests/giftcards/`,
`tests/e2e/public-flows.spec.ts` (or a new spec), `tests/fixtures/`,
`.github/workflows/ci.yml`, `lib/data.ts` static-fallback additions (only as
needed for e2e fixtures — honest synthetic rows, clearly non-production).

## Dependencies
16a: none. 16b: all functional tasks. Wave 5.

## Inputs
Plan §12; `tests/stack/factories.ts` fixed-clock pattern; existing e2e
locator conventions (role/testid-scoped).

## Exact deliverables
Test files + fixtures + CI wiring. No production-code changes except
test-only fixture data paths.

## Constraints
- Fixed `TEST_NOW`-style clocks everywhere; no reliance on wall time.
- Fixtures must be production-shaped (long brand lists, null dates,
  0%-points rows) — the repo's known trap.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
This task IS the tests. Everything above must fail meaningfully when its
invariant is broken (spot-check by temporary mutation during review).

## Acceptance criteria
`npx vitest run` and `npm run test:e2e` fully green on Node 20;
`npm run validate:all -- --with-e2e` green.

## Commands to validate
`nvm use 20 && npm run validate:all -- --with-e2e`

## Non-goals
Fixing functional bugs found (report to manager; separate correction cycle);
testing against production data.
