# TASK-38 — Offer-revision review actions: transactional audit

## Goal
Make every TASK-14 offer-revision mutation and its audit record commit or fail
as one database transaction.

## Root cause
The admin actions for explicit withdrawal, archive/restore and candidate status
changes currently call a mutation repository and `logAudit` separately. If the
audit insert fails after the first call, reviewed public truth has changed
without its required audit evidence. Split operations have the same boundary
unless their database operation owns the audit insertion.

## Scope
- Add forward-only, service-role RPC boundaries for the affected revision
  actions; do not edit an already-applied migration.
- Lock and validate the candidate plus linked canonical offer inside the RPC.
- Keep source-unavailable distinct from explicit withdrawal: the former must
  never unpublish a canonical offer.
- Revalidate restore/publication readiness and approved lineage in SQL, not
  only in the server action.
- Insert the audit row in the same transaction as every state/publication
  mutation.
- Make exact retries idempotent and reject stale/terminal state transitions.
- Route server actions through the RPC and remove duplicate post-write audit
  calls. Preserve admin auth and rate limiting.
- Add static migration contracts and focused action/repository tests.

## Acceptance criteria
- No reviewed offer/candidate mutation can commit if its audit insert fails.
- Unavailable source never archives a linked offer; confirmed withdrawal does.
- Restore cannot expose expired, future, unconfirmed or lineage-invalid rows.
- Split child creation, parent transition and audit are atomic.
- RPCs are `SECURITY DEFINER`, `search_path=''`, fully qualified, and executable
  only by `service_role`.

## Safety
No migration apply, production access, commit, push, deployment or source
enablement.
