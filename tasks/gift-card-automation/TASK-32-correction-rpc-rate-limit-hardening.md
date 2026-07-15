# TASK-32 — Public-correction RPC rate-limit hardening

## Goal
Make the applied correction-report boundary resistant to direct RPC bypass and
concurrent rate-limit races without changing the public route UX.

## Root cause
Migration 026 grants the SECURITY DEFINER RPC directly to anon/authenticated
while trusting a caller-supplied fingerprint. Direct clients can rotate that
value, and concurrent count-then-insert calls can exceed the limit. The Next
route already computes the fingerprint and invokes through service role.

## Scope
- Add a forward-only migration that revokes anon/authenticated execution and
  grants service_role only.
- Serialise the per-fingerprint quota decision (advisory transaction lock or a
  database-enforced bucket design) before count+insert.
- Preserve `search_path=''`, fully-qualified objects, public entity validation,
  private RLS and controlled route 404/429/503 behaviour.
- Add migration-contract and route tests; do not expose fingerprint or details.

## Acceptance criteria
- Direct anon/authenticated RPC calls are not authorised.
- Concurrent same-fingerprint submissions cannot exceed the configured daily
  limit.
- The server route remains the sole validated public entry and uses service
  role.
- Correction reports cannot mutate the reported public record.

## Safety
No migration apply, production access/data change, commit, push or deployment.
