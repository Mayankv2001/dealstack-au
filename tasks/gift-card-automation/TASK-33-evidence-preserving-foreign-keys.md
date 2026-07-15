# TASK-33 — Evidence-preserving gift-card foreign keys

## Goal
Prevent deletion cascades from destroying reviewed gift-card acceptance and
evidence history.

## Root cause
Migration 021 defines product/store acceptance foreign keys with `ON DELETE
CASCADE`, and authored migration 028 defines acceptance evidence with
`ON DELETE CASCADE`. These semantics conflict with the programme rule that
historical evidence and revisions are preserved.

## Scope
- Add a forward-only migration replacing destructive acceptance/evidence FKs
  with `RESTRICT` or another explicitly justified preservation-safe action.
- Preflight current constraints/rows and make retries safe.
- Keep candidate raw/source cleanup semantics separate from reviewed canonical
  evidence.
- Update migration docs/contracts and recovery guidance.

## Acceptance criteria
- Deleting a product, store or acceptance cannot silently delete reviewed
  evidence/history.
- Archival remains status/date based, not physical deletion.
- Existing rows remain valid and no public access is widened.

## Safety
No migration apply, production access/data change, commit, push, deploy or
source enablement.
