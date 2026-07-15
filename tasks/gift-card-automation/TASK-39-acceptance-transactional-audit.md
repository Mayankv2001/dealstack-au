# TASK-39 — Acceptance capture and review: transactional audit

## Goal
Make TASK-09/10/14 acceptance candidate staging, review edits, alias creation,
split/reject and bulk approval auditable without partial commits.

## Root cause
Several service-role repository writes are followed by `logAudit` in a second
request. Alias creation plus candidate resolution and split child creation plus
parent rejection also span multiple independent PostgREST transactions. An
audit or later write failure can leave an unrecorded or half-applied review.

## Scope
- Add forward-only service-role RPCs for capture batches and review mutations.
- Lock candidate/store/acceptance rows and validate open review state in SQL.
- Commit candidate edits, optional alias update, split children/parent state,
  removal/approval and audit rows atomically.
- Preserve migration 028 evidence ranking and append-only evidence rules.
- Make bulk approval all-or-nothing or explicitly return per-item transactional
  results; never emit one success audit over a partially applied batch.
- Keep rate limiting and `requireAdmin()` at the server-action boundary.
- Remove redundant post-write audit calls after the RPC owns the audit.
- Add static contracts and focused repository/action failure/idempotency tests.

## Acceptance criteria
- An audit insertion failure rolls back the corresponding acceptance write.
- Alias creation cannot commit without the candidate match and audit.
- Split cannot leave children without terminalising the parent or vice versa.
- Capture batches have one attributable audit in the same transaction.
- RPCs use `SECURITY DEFINER`, `search_path=''`, fully qualified references and
  service-role-only grants.

## Safety
No migration apply, production access, commit, push, deployment or source
enablement.
