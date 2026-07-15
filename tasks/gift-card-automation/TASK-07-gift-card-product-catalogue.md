# TASK-07 — Gift-card product catalogue

## Goal
Complete the product-catalogue layer (issuer / family / product / variants /
aliases) so acceptance, offers, and search can hang off canonical products —
with zero invented facts.

## Scope
- Extend `lib/repos/giftCardProducts.ts` + `lib/offers/types.ts` for the 028
  product columns (aliases, official page, activation, availability,
  denominations, split payment, expiry/fees note) with honest null handling.
- Admin create/edit form fields for the new columns in
  `app/admin/(protected)/gift-cards/` product management (inspect what exists
  under `products`/`new` first; extend, don't rebuild). Every write audited.
- A reviewed seed **script** (not auto-run) `scripts/seed-gift-card-products.ts`
  that inserts ONLY products whose every field carries a cited evidence URL in
  `source_evidence` — initial set: TCN Shop / Love / Good Food / Cinema /
  Him / Her, Ultimate families, Restaurant Choice, Apple, Myer — with fields
  left null wherever no evidence is captured. The script prints a diff and
  requires `--write` to touch a database; default is dry-run.
- Similar-named products are distinct unless evidence says otherwise (e.g.
  TCN Him vs Her are separate rows; no merging).
- `/gift-cards/products` page: render the new fields where present (honest
  "not recorded" fallbacks per house style).

## Files likely involved
`lib/repos/giftCardProducts.ts`, `lib/offers/types.ts`,
`app/admin/(protected)/gift-cards/` (product form + actions),
`app/gift-cards/products/`, `scripts/seed-gift-card-products.ts` (new),
`tests/giftcards/` (extend product-related tests).

## Dependencies
TASK-02 (028 shape; degrade honestly pre-apply). Wave 1.

## Inputs
Plan §6; existing product page/repo; issuer pages captured manually for the
seed evidence (URLs only; no scraping).

## Exact deliverables
Types + repo + admin form + public rendering + dry-run seed script + tests.

## Constraints
- **No invented denominations, availability, activation, or network facts.**
  A field without a captured evidence URL stays null.
- Seed script never runs automatically; `--write` documented as
  approval-gated.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
Repo null-handling; view rendering with fully-null products; seed script
dry-run output shape; alias fields round-trip.

## Acceptance criteria
Diff contains no hard-coded product facts outside the evidence-cited seed
script; public page renders unknown fields honestly.

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npx tsc --noEmit`

## Non-goals
Acceptance rows (TASK-08/09); merchant search (TASK-11); running the seed.
