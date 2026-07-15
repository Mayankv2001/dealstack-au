# TASK-08 — Merchant-acceptance model and staging

## Goal
Code layer for the extended acceptance model (028): typed statuses, evidence
tiers, channels, freshness, MCC rows, and the candidate staging shape — the
substrate every acceptance feature builds on.

## Scope
- Extend `lib/offers/types.ts` (`GiftCardAcceptanceRow`) and
  `lib/giftcards/acceptanceModel.ts` with: acceptance status vocabulary
  (`confirmed-accepted`, `confirmed-not-accepted`, `likely-accepted`,
  `unofficially-reported`, `requires-verification`, `stale`, `unknown`),
  evidence tiers (issuer-official > merchant-official > terms >
  card-network-mcc > gcdb > specialist > community), channel tri-states
  (online / in-store / app / phone), `validFrom`/`validUntil`, limitations,
  region, freshness derivation (checked-at + configurable staleness window;
  reuse the `lib/freshness.ts` / `STALE_DATA_DAYS` conventions — inspect
  both, pick one, document why).
- Pure helpers: `deriveAcceptanceFreshness(row, now)`,
  `acceptanceEvidenceLabel(row)` producing the exact public wording set
  ("Officially listed by {issuer}", "Listed by GCDB; issuer confirmation not
  found", "Unofficial MCC-based acceptance", "Acceptance requires
  verification"), `isCurrentlyAccepted(row, now)`.
- MCC rows: `store_id`-null + `mcc`-set rows modelled distinctly; official
  MCC support and unofficially-reported MCC support are separate rows with
  separate tiers; helper returns the mandatory disclaimer.
- Repo layer: `lib/repos/giftCardProducts.ts` (public reads — approved+public
  rows only) and `lib/admin/repos/` acceptance-candidate CRUD (service-role)
  matching the 028 staging table.
- Update `searchAcceptance.ts` to respect status/freshness (only
  approved-public, non-`confirmed-not-accepted` rows returned; stale rows
  flagged, not hidden — display decisions belong to callers).

## Files likely involved
`lib/offers/types.ts`, `lib/giftcards/acceptanceModel.ts`,
`lib/giftcards/searchAcceptance.ts`, `lib/repos/giftCardProducts.ts`,
`lib/admin/repos/giftCardAcceptance.ts` (new),
`tests/giftcards/acceptanceModel.test.ts`, `searchAcceptance.test.ts`
(extend), `tests/giftcards/acceptanceFreshness.test.ts` (new).

## Dependencies
TASK-02 (028). Wave 1. Blocks 09/10/11.

## Inputs
Plan §6; existing `acceptanceModel.ts`, `freshness.ts`,
`stack/compatibility.ts` staleness conventions.

## Exact deliverables
Types + pure helpers + repos + tests. No ingestion, no UI.

## Constraints
- Official and unofficial evidence never collapse into one value; no helper
  may return "accepted" for `unofficially-reported` without the unofficial
  label attached.
- Unknown channel stays unknown (tri-state), never defaults to true.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Status/tier ordering; freshness boundaries; wording exactness; MCC disclaimer
always present for MCC-derived acceptance; `confirmed-not-accepted` excluded
from positive lookups; stale flagged not hidden; legacy `status` column
mapping (verified/claimed/community → new vocabulary) documented and tested.

## Acceptance criteria
Vocabulary matches the plan exactly; every public string sourced from the
label helper (greppable single source of truth).

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Parsing merchant lists (TASK-09); reconciliation (TASK-10); ranking (TASK-11);
admin UI (TASK-14).
