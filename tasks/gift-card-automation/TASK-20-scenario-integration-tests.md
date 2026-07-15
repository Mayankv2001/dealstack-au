# TASK-20 — Gift-card scenario integration tests

## Goal
Prove the required Nike, expiry, material-change, prediction, acceptance and
partial-source-failure scenarios across the pure engines and repository
boundaries with fixed clocks and production-shaped fixtures.

## Root cause
Focused unit tests exist, but no integrated suite proves each mandated scenario
from resolution through planning/reconciliation/history and monitoring.

## Scope
- Add separate scenario tests for Nike/TCN Shop+Love, activation/expiry/history,
  material revision, prediction match/partial/miss isolation, acceptance
  add/remove/evidence upgrade, and partial source failure.
- Assert included/evaluated-not-included/rewards/general opportunities are
  disjoint and use engine-supported reasons.
- Assert cash, points, bonus value, cashback-later and future credit remain
  separate.
- Use synthetic fixtures only; do not add merchant facts to production data.

## Dependencies
TASK-18, TASK-19, TASK-15 monitoring.

## Files likely involved
New files under `tests/giftcards/scenarios/`, `tests/decision/`, shared test
factories only where required.

## Exact deliverables
Small scenario files, each mapping directly to one demonstration in the
engineering-manager brief.

## Required tests
Every numbered step in the six required demonstrations must have a direct
assertion; temporary source failure must preserve canonical truth.

## Acceptance criteria
Tests fail when prediction data is injected into live offers, acceptance alone
becomes compatible, or a material source value overwrites a canonical row.

## Validation commands
`nvm use 20 && npm run test:giftcards && npm run test:decision && npm run test:stack && npx vitest run && git diff --check`

## Non-goals
Production code fixes, Playwright/browser coverage, real production data.

## Safety
Do not commit, push, deploy, apply migrations, enable jobs, or change
production data.
