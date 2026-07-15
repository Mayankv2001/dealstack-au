# TASK-21 — Gift-card browser, responsive and accessibility scenarios

## Goal
Add Playwright demonstrations for public gift-card acceptance, store-to-card
planning, card-to-merchant search, expiry warnings and honest included/excluded
presentation at 1440×900 and 390×844.

## Root cause
The existing public E2E suite checks general pages and empty states, but it does
not exercise a production-shaped Nike multi-card plan or the new acceptance
detail and saved-plan history warning states.

## Scope
- Add test-only static fixtures for two accepted cards/offers at one merchant.
- Exercise both search directions and option selection into the purchase plan.
- Assert evidence/freshness/channels, cash-vs-later values, truthful exclusions,
  expired-plan warning, no horizontal overflow and automated accessibility.
- Keep fixture data clearly synthetic and outside production repositories.

## Dependencies
TASK-13, TASK-20; functional bugs must be reported, not hidden by weaker tests.

## Files likely involved
`tests/e2e/`, Playwright-only fixture wiring, test-only static data helpers.

## Exact deliverables
Focused E2E spec(s) and deterministic test fixtures for both configured
viewports.

## Required tests
Nike two-card flow; where-to-use; gift-card detail acceptance; expired saved
plan; 1440/390 overflow; roles/names and axe scan.

## Acceptance criteria
`npm run test:e2e` is green with explicit assertions for each required public
state, not merely route availability.

## Validation commands
`nvm use 20 && npm run build && npm run test:e2e && git diff --check`

## Non-goals
Admin authenticated E2E against production, VoiceOver claims, production seed
data.

## Safety
Do not commit, push, deploy, apply migrations, enable jobs, or change
production data.
