# TASK-10 — Acceptance reconciliation, change detection, and history

## Goal
Give merchant acceptance its own freshness/change lifecycle, independent of
offers: detect additions/removals/renames/channel changes, preserve history,
and mark staleness — via review, never silent mutation.

## Scope
- New pure `lib/giftcards/reconcileAcceptance.ts`: inputs = current approved
  acceptance rows + newest captured candidate set (per product/source) +
  clock. Outcomes: `merchant-added | merchant-removed | merchant-renamed |
  alias-changed | online-changed | in-store-changed | terms-changed |
  mcc-changed | evidence-source-missing | became-stale |
  official-supersedes-unofficial | unchanged`.
- Material acceptance changes → `changed`/`removed` acceptance candidates for
  review. Removal NEVER deletes: on approval, the previous row keeps its
  evidence and gets `valid_until` + status `confirmed-not-accepted` (or
  `requires-verification` per admin choice), preserving history.
- `official-supersedes-unofficial`: when official evidence arrives for a
  relationship previously supported only by unofficial evidence, stage an
  upgrade candidate; both evidence records remain.
- Staleness: rows past the staleness window derive `stale` (TASK-08 helper);
  reconciliation emits `became-stale` for health counting; stale rows stop
  being recommended for NEW plans (consumed by TASK-11) while existing plans
  show "Merchant acceptance has changed since this plan was created." —
  provide the pure predicate + copy constant here.
- Hook into the TASK-05 reconcile route as an additional ordered step
  (`acceptance` step in the structured result).

## Files likely involved
`lib/giftcards/reconcileAcceptance.ts` (new),
`lib/admin/repos/giftCardAcceptance.ts` (apply functions),
`app/api/cron/gift-card-reconcile/route.ts` (add step),
`tests/giftcards/reconcileAcceptance.test.ts` (new).

## Dependencies
TASK-08, TASK-09; TASK-05 route. Wave 2.

## Inputs
Plan §6 acceptance-reconciliation outcomes; TASK-04's engine style (mirror it).

## Exact deliverables
Pure engine + apply functions + route step + tests.

## Constraints
- No silent disappearance: every removal goes through a reviewable candidate;
  approved removals retain the historical row with evidence.
- Acceptance freshness independent from offer freshness.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
One per outcome; removal preserves history + evidence; official-supersedes
keeps both records; stale derivation boundary; step failure isolation in the
route; idempotent re-run.

## Acceptance criteria
No code path deletes an acceptance row; all mutations audited; outcomes
machine-readable in the route result.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Ranking/search behaviour (TASK-11); plan-warning UI (TASK-13).
