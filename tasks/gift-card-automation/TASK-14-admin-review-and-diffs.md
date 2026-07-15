# TASK-14 — Admin review: revisions, acceptance queue, predictions

## Goal
Give administrators complete review surfaces for offer revisions, acceptance
candidates, and predictions — with field-level diffs, full action set, and
audit on every write.

## Scope
- **Offer revisions** (`/admin/gift-cards/review`): for `changed` candidates
  linked to an approved offer, render a field-level diff against the current
  published row (value, dates, limits, cards, seller, exclusions, evidence)
  plus raw snapshot, normalised candidate, duplicate verdicts, validation
  warnings, freshness. Actions to add where missing: approve revision, mark
  withdrawn, mark source unavailable, archive, restore, split incorrectly
  merged records (reuse the 023 sub-offer machinery — inspect first).
- **Acceptance queue** (new `/admin/gift-cards/acceptance`): list + detail for
  acceptance candidates showing raw merchant name, resolved store, product,
  evidence tier/URL/captured-at, channels, MCC, limitations, previous approved
  relationship, field diff, resolution state, validation warnings. Actions:
  approve, reject, correct merchant match, create alias (writes
  `stores.aliases`, audited), mark unofficial, mark no-longer-accepted,
  merge duplicate relationship, split incorrect relationship, request
  recheck. Bulk actions via the existing `AdminListTable` `bulk` prop, capped
  200, one rate-limit unit per batch.
- **Predictions** (new `/admin/gift-cards/predictions`): read-heavy list with
  status/outcome, linked offer, comparison notes; actions limited to record
  outcome / link confirmed offer / add note. Clear banner that predictions
  are never publishable.
- All actions go through service-role repos + `lib/admin/rate-limit.ts` +
  audit (`lib/admin/repos/audit.ts`); approval writes only via the
  security-definer RPCs (offer 023 RPC, acceptance 028 RPC).

## Files likely involved
`app/admin/(protected)/gift-cards/review/`, `.../acceptance/` (new),
`.../predictions/` (new), `lib/admin/repos/giftCardPipeline.ts`,
`giftCardAcceptance.ts`, `giftCardPredictions.ts`,
`lib/giftcards/approvalValidation.ts` (acceptance variant),
`tests/admin/` (extend action/rate-limit tests),
`tests/giftcards/` (diff/view-model tests).

## Dependencies
TASK-04 (revision candidates), TASK-08/09 (acceptance), TASK-06
(predictions). Wave 4.

## Inputs
Existing review UI patterns (`AdminListTable`, candidate cards, bulk prop);
`lib/admin/offerChangeViews.ts` diff conventions.

## Exact deliverables
Three review surfaces + actions + validation + tests.

## Constraints
- `requireAdmin()` on every entry point; no service-role call from client
  components; every mutation audited and rate-limited.
- Approval of an acceptance candidate requires evidence URL + tier +
  captured-at (validation mirror of `approvalValidation.ts`).
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Action-level tests in `test:admin` style (rate limit, audit row, state
guards); diff rendering for a changed candidate; acceptance approval blocked
without evidence; alias creation audited; bulk cap enforced.

## Acceptance criteria
No mutation path bypasses audit/rate-limit; predictions page has no publish
affordance at all.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:admin && npm run test:giftcards && npm run build`

## Non-goals
Public pages (TASK-13); new approval policy; auto-approval of anything.
