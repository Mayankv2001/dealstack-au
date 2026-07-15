# TASK-18 — Live reconciliation data boundary and audited apply adapters

## Goal
Replace the placeholder `loadReconcileInputs()` implementation with real,
service-role reads and writes over stored source snapshots, canonical offers,
predictions and acceptance candidates, without fetching a disabled source or
weakening review/publication boundaries.

## Root cause
`lib/admin/repos/giftCardReconcileData.ts` currently returns empty arrays and
no-op callbacks. The route and pure engine therefore pass tests but cannot
detect or persist any real reconciliation outcome.

## Scope
- Build `ReconcileItem[]` from canonical offer lineage plus the newest stored,
  successfully parsed raw/candidate snapshot for each approved source item.
- Load prediction and acceptance inputs from their private repositories.
- Implement apply adapters for new/material/withdrawn revisions, safe
  last-seen refresh, source-unavailable review flags, prediction outcomes and
  acceptance outcomes.
- A temporary missing/failed source must not unpublish or expire public truth.
- Every material write must be audited. No direct candidate-to-public write.
- Fail closed with a controlled no-op when migrations 028–030 are absent.

## Dependencies
TASK-04, TASK-06, TASK-10, migrations 023/028/029/030 reviewed but unapplied.

## Files likely involved
`lib/admin/repos/giftCardReconcileData.ts`, `giftCardPipeline.ts`,
`giftCardPredictions.ts`, `giftCardAcceptance.ts`, `lib/giftcards/runReconcile.ts`,
`tests/giftcards/reconcileRoute.test.ts`, new repo/adapter tests in `tests/admin/`.

## Exact deliverables
Real input loaders, audited adapters, missing-schema fail-closed handling, and
tests proving public rows remain unchanged until separate admin approval.

## Required tests
New/unchanged/material/withdrawn/source-unavailable/parse-failure inputs;
partial source failure; prediction match/miss persistence; acceptance
addition/removal staging; idempotent repeat; migration-missing controlled
no-op; audit on every material mutation.

## Acceptance criteria
No callback is a placeholder; a production-shaped fixture produces a private
revision while the canonical offer remains byte-for-byte unchanged.

## Validation commands
`nvm use 20 && npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run test:admin && git diff --check`

## Non-goals
Network fetching, lifecycle activation/archive, monitoring UI, applying a
migration, enabling a source.

## Safety
Do not commit, push, deploy, apply migrations, enable sources, or change
production data.
