# TASK-36 — Reconciliation/lifecycle handoff and canonical-state filtering

## Goal
Make TASK-05's real route hand confirmed expiry to TASK-03 exactly once and
prevent archived offers from being reconciled forever from retained raw rows.

## Root cause
`loadReconcileInputs()` now fails closed without an injected lifecycle adapter,
but the reconcile route injects none. The stored loader derives baselines from
approved candidates without checking canonical lifecycle state, so archived
offers can reappear as expired inputs on every daily run.

## Scope
- Load only canonical offers in `active` or `approved-future` lifecycle states;
  missing lifecycle schema is a controlled default-off/schema-unavailable state.
- Inject a fixed route clock into loading and every apply callback.
- Lazily call the transactional lifecycle RPC once per reconcile run, while the
  shared job fence is held; fan its result out to all expired outcomes.
- A lifecycle error must remain isolated/observable and must not stage a removal
  candidate or mutate public truth through reconciliation.
- Revalidate all affected public routes after successful transitions.
- Correct stale route/workflow wording about closed sources.

## Required tests
No adapter -> no mutation; one and many expired records -> one lifecycle RPC;
archived records excluded; active/future retained; fixed clock; lifecycle partial
error; cache invalidation; closed source no unavailable noise; idempotent rerun.

## Safety
Do not enable routes, apply migrations, commit, push, deploy, fetch, or change
production data.
