# TASK-28 — Offer approval identity and publication hardening

## Goal
Close the canonical-offer approval defects shared by TASK-03/TASK-04 without
rewriting a migration that may already exist in an environment.

## Root cause
The current 023/031 `approve_gift_card_candidate` RPC accepts an arbitrary
`p_offer_id`, defaults confidence to `needs-verification` while setting
`is_published=true`, and publishes approved future-dated rows before their
Sydney start date. A changed candidate can therefore overwrite an unrelated
canonical offer and unconfirmed/upcoming data can pass the direct RLS surface.

## Scope
- Add a forward-only migration after the current ledger that replaces the RPC
  safely; do not edit 023 or 031.
- A changed candidate with `approved_offer_id` may update only that same offer.
- A new candidate may not select an ID that already belongs to unrelated source
  lineage.
- Publication requires `confidence='confirmed'` and a currently-open Sydney
  date window (or explicitly ongoing); approved future rows are stored inactive
  for TASK-03 lifecycle activation.
- Expired candidates cannot be newly published.
- Preserve candidate lock, source lineage, compound guards, full mechanic
  validation, transactional audit, service-role-only grant and
  `search_path=''`.
- Add schema-manifest/migration-contract and action-level linkage tests.

## Acceptance criteria
- Arbitrary cross-offer overwrite is rejected in SQL and app tests.
- `needs-verification` never becomes publicly readable.
- A future approved offer remains `is_published=false` until lifecycle runs on
  its Sydney start date.
- Current confirmed and ongoing confirmed offers retain the normal reviewed
  approval path.
- Repeated approval is controlled/idempotent and no candidate auto-publishes.

## Safety
Do not apply migrations, change data, enable ingestion, commit, push, deploy or
access production. The new migration remains unapplied pending ledger review.
