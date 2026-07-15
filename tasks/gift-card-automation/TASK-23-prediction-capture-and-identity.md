# TASK-23 — Prediction capture path and immutable stable identity

## Goal
Complete the private, admin-assisted GCDB prediction ingestion path with a
stable fingerprint that includes seller, families and predicted window.

## Root cause
The parser and private repository exist, but no admin paste/upload action calls
them. Migration 029 has no fingerprint column/unique key, and the repository's
fallback natural key omits card families, so distinct predictions can collide.
The migration also registers the obsolete brief URL while the verified current
canonical page is `https://gcdb.com.au/predictions/`.

## Scope
- Add an additive fingerprint column and unique source/fingerprint identity to
  migration 029 (it is unapplied), with matching manifest/contract/docs.
- Register the current canonical prediction URL with both gates closed.
- Add an authenticated, rate-limited, audited admin snapshot capture action
  that parses pasted/uploaded HTML and calls the private repo only.
- Preserve original prediction fields on re-capture; never infer marker meaning
  without a source legend; never create a public offer.

## Dependencies
TASK-01, TASK-02/029, TASK-06, TASK-14.

## Files likely involved
`supabase/migrations/029_gift_card_predictions.sql`, `scripts/schema-manifest.ts`,
`lib/giftcards/parsePredictions.ts`, `lib/admin/repos/giftCardPredictions.ts`,
admin prediction actions/forms, migration/action/isolation tests and source docs.

## Exact deliverables
Stable identity, private capture form/action, preserved immutable facts, current
source URL and focused security tests.

## Required tests
Same seller/window with different families remains distinct; exact re-capture
is idempotent; rate limit/auth/audit; missing 029 controlled; marker remains
uninterpreted; public repos remain import-isolated.

## Acceptance criteria
An admin can paste the captured fixture and stage private predictions without
any network request or public-table write.

## Validation commands
`nvm use 20 && npm run lint && npx tsc --noEmit && npm run test:giftcards && npm run test:admin && git diff --check`

## Non-goals
Automated prediction fetching, public predictions page, source enablement,
migration application.

## Safety
Do not commit, push, deploy, apply migrations, enable sources, or change
production data.
