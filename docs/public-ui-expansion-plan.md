# Public UI Expansion Plan

> **Status: the `/cards` surface below has since shipped.** Migration 007
> is applied to production, `/cards` is live (`app/cards/page.tsx`,
> `getCardOffers()` in `lib/repos/offers.ts`), and nav links to it exist on
> the homepage and every other top-level page. Sequencing steps 1–3 below
> are done; only the homepage pillar tile / `/resources` cross-link (step 4)
> remained optional. The rest of this document is kept as the original
> planning rationale — read "nothing below exists yet" and the "Explicit
> non-goals" section as describing the state *at planning time*, not today.
>
> **Deals update (2026-07-12):** the old `DealsClient` chip/feed implementation
> referenced below has been retired. `/deals` now uses server-rendered,
> URL-backed views and the architecture documented in `docs/deals-discovery.md`.

## What's already live (no plan needed — shipped in Phases 3–5)

| Category | Where it already surfaces |
|---|---|
| Grocery, automotive, electronics, beauty, fashion, household | `/deals` (via `ozbargain_signals`), `/search`, homepage Top 5, matched store pages — already ranked/classified as preferred by Phases 3–4 |
| ShopBack/TopCashback cashback | `/deals?view=cashback`, stack calculator, store pages — live |
| Gift cards | `/deals?view=gift-cards` — live |
| Qantas/Velocity/Flybuys/Everyday Rewards points | `/deals?view=points` plus the `program` URL filter — live |
| Uber Eats/DoorDash dining delivery | `/deals` "OzBargain signals" filter (via `ozbargain_signals`) once imported — pipeline unblocked in Phase 3, admin queue presets added in Phase 5 |

**No UI work is needed for these** — they ride on data that already exists
and renders. This plan is only for the two content types that need a **new**
table before they can render anything (`card_offers` from Phase 6, and
optionally `dining_delivery_offers` from Phase 8).

## New surface: credit card / bank offers

This was gated on the Phase 6 (`docs/bank-card-offer-workflow.md`) migration
being explicitly approved and built — that gate has since cleared and the
page described below is live (see status note at the top of this document).

### Recommended: a dedicated `/cards` page, not a `/deals` filter tab

Reasoning: every other `/deals` filter (gift cards, points, cashback,
signals) is fundamentally **merchant-stacking** content — "how much can I
save at store X by combining these layers." A card sign-up bonus or bank
statement credit is a **product comparison** ("which card should I get"), not
a per-merchant stack. Forcing it into the `FilterId` union
(`components/DealsClient.tsx`) would misrepresent it as another stacking
layer and complicate `buildStack.ts`, which has no concept of "apply for a
card" as a stackable component.

A standalone `/cards` route mirrors how `/deals`, `/search`, and `/stores/*`
are already separate top-level concerns.

**Proposed structure** (build only after Phase 6 is approved):

- `app/cards/page.tsx` — server component, fetches published `card_offers`
  via a new `getCardOffers()` in `lib/repos/offers.ts` (anon client, RLS
  already filters to `is_published = true` per the Phase 6 schema).
- Simple filter chips by `bonus_type` (Points / Cashback / Gift card /
  Statement credit) and by bank — same interaction pattern as the existing
  `Chip` component in `DealsClient.tsx`, reused rather than reinvented.
- Each card shows: bank + card name, bonus value, minimum spend + window,
  annual fee, eligibility notes, expiry, source link (`nofollow`, display
  only), and the same `ConfidenceBadge` + "Verify before you apply" framing
  already used everywhere else public-facing OzBargain/offer data appears.
- Link from the homepage (a new tile in `HomeClient.tsx`'s existing "how this
  works" pillar row — pattern already established for "Verify before you
  buy") and from `/resources`, whose existing **"Credit card sign-up bonus
  resources"** section (`app/resources/page.tsx`) is currently generic guide
  links — it should link through to `/cards` once real data exists, giving
  that editorial section live comparable offers instead of just external
  guide pointers.
- Nav: add `/cards` to the existing top nav alongside `/deals`, `/search`,
  `/resources` — a one-line addition, not a redesign.

### Sequencing

1. ✅ Phase 6 migration approved and built (own reviewable change).
2. ✅ Admin CRUD + a handful of manually-entered rows (so the page isn't empty
   on launch).
3. ✅ `getCardOffers()` read path + `/cards` page + nav link — shipped.
4. Homepage tile + `/resources` cross-link — optional follow-up, not required
   for launch.

## New surface: dining delivery (only if the optional table gets built)

If `dining_delivery_offers` (proposed in `docs/dining-delivery-offers.md`) is
ever built, it fits naturally as **one more `/deals` filter chip** ("Dining
delivery") — unlike card offers, a dining-delivery promo genuinely is a
one-off, merchant/platform-agnostic voucher-style deal, the same shape as the
existing "Gift cards" and "OzBargain signals" filters. No standalone page
needed; add `"dining-delivery"` to `FilterId` and a `buildDiningDeliveryDeals`
function mirroring the existing `buildGiftCardDeals`/`buildPointsDeals`
pattern in `DealsClient.tsx`.

Until then — and this covers the vast majority of near-term dining-delivery
content per Phase 8's decision — these deals already render fine as ordinary
`ozbargain_signals` under the existing "OzBargain signals" filter.

## Explicit non-goals as of this original planning phase (now superseded — see status note at top)

- ❌ No new route, page, or nav entry created. *(Since done — see status note.)*
- ❌ No changes to `app/layout.tsx` (root layout untouched, per rule) — still true today.
- ❌ No changes to `app/globals.css` — still true today.
- ❌ No redesign of `/deals`, `/resources`, `/stores/*`, or the homepage —
  everything above is additive (new page, new filter chip, new nav link,
  new cross-link), not a rework of existing UI — still true today.
