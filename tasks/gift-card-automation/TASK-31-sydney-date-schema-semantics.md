# TASK-31 — Sydney calendar semantics in schema rules

## Goal
Remove UTC `current_date` drift from gift-card programme, occurrence and
acceptance lifecycle rules by using one Australia/Sydney calendar expression.

## Root cause
Applied migration 024 and authored 025/028 use database-session
`current_date`. Between Sydney midnight and UTC midnight, public validity,
history sealing and default removal dates can be wrong by one local day.

## Scope
- Add a forward-only migration after the current ledger; do not rewrite
  applied 024/025 or uncertain 028.
- Replace affected public checks/policies/function defaults with
  `(timezone('Australia/Sydney', now()))::date` or an equivalently immutable
  transaction-time expression.
- Coordinate with migration 032 so occurrence fixes are not duplicated.
- Update contracts/docs and test AEST/AEDT boundary instants.

## Acceptance criteria
- Programme/rate visibility, offer-history sealing and acceptance removal use
  Sydney dates at both DST offsets.
- Existing rows remain valid; constraints needing legacy tolerance are
  preflighted or `NOT VALID` with an explicit validation plan.
- No public write policy or source gate is widened.

## Safety
No migration apply, production connection, data change, commit, push, deploy
or source enablement.
