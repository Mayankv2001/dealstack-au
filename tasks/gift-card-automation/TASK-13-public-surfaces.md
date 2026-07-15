# TASK-13 — Public gift-card surfaces

## Goal
Surface the new acceptance, evidence-tier, freshness, and lifecycle data on
public pages with the mandated trust wording — preserving the soft-emerald
style and never redesigning existing pages.

## Scope
- `/gift-cards/[id]` detail: acceptance section upgraded to show per-merchant
  channel flags, evidence-tier label (TASK-08 helper), last-checked,
  limitations, and the official-vs-unofficial MCC split with the standing
  disclaimer. "Buy from / issuer / card family / redeem at / discovered via /
  corroborated by / reviewed by DealStack / last checked" fields rendered
  where data exists; honest fallbacks otherwise.
- `/gift-cards/where-to-use` (exists): consume the TASK-08 status/freshness
  gating; show evidence labels; distinguish purchase location from redemption
  location visually and in copy.
- Store pages + search results: render `retailerGiftCardPlans` options from
  TASK-11 (option card: card name, seller, promotion, cash paid, value
  received, later value, channel, freshness, compatibility label, ordered
  steps, uncertainty). Excluded options listed with their truthful reasons
  where the design has an affordance for it (follow existing decision UI
  patterns from the purchase-planning redesign — inspect first).
- History page: expired offers remain reachable; linked/saved plans referring
  to an expired offer or changed acceptance show the expired /
  "acceptance has changed" warnings (copy constants from TASK-03/10).
- **Predictions page is OUT unless the user separately approves it.** If
  approved later, `/gift-cards/predictions` gets its own task with the
  mandated disclaimer banner; the default Gift Cards page continues to show
  confirmed current offers only regardless.

## Files likely involved
`app/gift-cards/[id]/page.tsx`, `app/gift-cards/where-to-use/`,
`app/stores/[slug]/page.tsx`, `app/search/page.tsx`,
`app/gift-cards/history/`, `components/` (gift-card + decision components),
`lib/giftcards/offerCardViewModel.ts` (extend via view-model, never raw JSX
logic), `tests/giftcards/` view-model tests, `tests/decision/
retailerGiftCardPlans.test.tsx`.

## Dependencies
TASK-11, TASK-12 (+ TASK-06 only if predictions page approved). Wave 4.

## Inputs
Plan §6 wording, §8 display list; existing view-model/test conventions;
`docs/homepage-experience.md` style rules.

## Exact deliverables
Extended view-models + page sections + tests (view-model level, plus
component tests where the repo already has `.tsx` tests).

## Constraints
- All rendered strings come from view-models/helpers (unit-testable); no
  facts computed in JSX.
- Australian spelling; AUD formatting; no layout redesign; mobile must not
  overflow horizontally.
- No prediction content on any surface.
- Standing constraints in `TASK-00-INDEX.md`.

## Required tests
View-model rendering for: full acceptance row, MCC-only row (disclaimer
present), unofficial row (label present), stale row, removed merchant
(absent from current, present in history), expired-offer warning, null-heavy
rows.

## Acceptance criteria
Every evidence label matches the TASK-08 catalogue verbatim; honest fallbacks
throughout; no horizontal overflow at 390×844 (checked in TASK-16 e2e).

## Commands to validate
`nvm use 20 && npm run lint && npm run test:giftcards && npm run test:decision && npm run build`

## Non-goals
Admin UI (TASK-14); new routes beyond listed; predictions page.
