# TASK-27 — Job-run lock conformance and cross-kind fencing

## Goal
Reconcile TASK-02's required per-`(source_id, run_kind)` uniqueness with the
programme requirement that ingestion, reconciliation and lifecycle work cannot
corrupt each other when their schedules overlap.

## Root cause
Migration 030 currently adds only a non-unique lookup index and retains the
legacy global running lock, contrary to TASK-02's exact migration deliverable.
Simply dropping the global lock would be unsafe because stale takeover and
interval queries were historically not kind-scoped and lifecycle/reconcile may
touch the same offers.

## Scope
- Make every stale-run takeover and interval query explicitly `run_kind`
  scoped where appropriate.
- Add the required unique partial index on `(source_id, run_kind)`.
- Retain or introduce an explicit cross-kind mutation fence for reconcile and
  activate/archive so they cannot mutate the same gift-card truth
  concurrently; document why.
- Preserve existing ingest-row validity (`run_kind='ingest'`) and idempotent
  retries.
- Update migration 030, its design doc, manifest/contracts and focused runner
  tests. Do not apply it.

## Acceptance criteria
- Duplicate same-source/same-kind runs are database-rejected.
- One job cannot mark a different source/kind run stale.
- Reconcile and lifecycle cannot execute conflicting mutation sections
  simultaneously.
- Existing rows remain valid and no gate is enabled.
- The implementation and documentation no longer contradict TASK-02.

## Safety
Migration 030 remains unapplied. No production access, migration application,
source enablement, commit, push or deployment.
