# PLAN: Card offers in search — the live `/cards` content is invisible to `/search`

> **Rank: 4 of 5.** `/cards` shipped and 5 card offers are published, but
> the search pool never learned about them: `loadDbSourceResults`
> (`lib/repos/sourceResults.ts:296-327`) assembles cashback, gift cards,
> points and signals — no `card_offers` query — and the static sample pool
> (`lib/sources/manualData.ts`) predates the feature entirely. Searching
> "amex", "qantas card" or a card name on `/search` returns nothing from
> the card catalogue. This plan adds published card offers to the
> "Checked sources" search results as a new `card` deal kind, reusing the
> existing dedupe/rank/render pipeline unchanged.

## Prerequisites

- `nvm use 20`; read `AGENTS.md`.
- Read before coding:
  - `lib/sources/types.ts` — `SourceId`, `DealKind`, `DealSourceResult`,
    `SOURCE_META`.
  - `lib/repos/sourceResults.ts` — the row-shape + mapper + query pattern
    you will replicate for card offers (`cashbackToResult` is the closest
    template), and `DEAL_KINDS`/`asDealKind` (:50-62) — understand what it
    guards before deciding not to touch it (edge case 2).
  - `lib/sources/searchSources.ts` — `haystack()` (:20-37; note
    `cardOrProvider` is already searched) and `dedupeResults` keying.
  - `lib/sources/ranking.ts` — `savingsScore`, `recencyScore` (the
    `halfLifeDays` switch at :63 matters here).
  - `components/SourceResultCard.tsx` — `kindIcons` (:37-43) and the
    headline logic (:65-68).
  - `components/WeeklyDealCard.tsx` — `kindIcons: Record<DealKind, …>`
    (:134-140) — widening `DealKind` makes this a compile error until
    extended.
  - `lib/offers/types.ts` — `CardOffer` / `CardOfferType`.
  - `lib/offers/manualOffers.ts` — `cardOffers` demo rows (:330+).

## Goal

A published card offer surfaces as a "Checked sources" result on `/search`
(cross-entity search), with a card icon, the "DealStack verified" source
badge, a human headline (e.g. "120,000 bonus points" / "$300 cashback"),
the offer summary, expiry-aware confidence, and the bank's public offer
page as the source link — identical treatment to the other result kinds.
Demo mode (`DATA_SOURCE=static` / no Supabase) shows the demo card rows,
consistent with how every other kind falls back.

## Exact files to touch

| File | Change |
|---|---|
| `lib/sources/types.ts` | Add `"card"` to `DealKind` |
| `lib/sources/cardResults.ts` | **New** — pure `CardOffer → DealSourceResult` mapper + headline helper |
| `lib/repos/sourceResults.ts` | Query `card_offers`, map via the new helper, add to the pool |
| `lib/sources/manualData.ts` | Derive static card results from `cardOffers` via the same helper |
| `components/SourceResultCard.tsx` | `card` entry in `kindIcons` |
| `components/WeeklyDealCard.tsx` | `card` entry in its `kindIcons` record |
| `lib/sources/ranking.ts` | Card results decay like guides (60-day half-life) |
| `tests/stack/cardResults.test.ts` | **New** — mapper + headline unit tests |
| `tests/stack/ranking.test.ts` | Half-life / ranking coverage for kind `card` |

No migrations (RLS on `card_offers` already limits anon reads to
`is_published = true`). No `/deals` changes, no new route, no nav change.

## Step-by-step implementation order

### Step 1 — widen the kind union

`lib/sources/types.ts`: `DealKind` gains `| "card"`. Now run
`npx tsc --noEmit` (or `npm run build`) and let the compiler enumerate
every exhaustive map that must learn the new member — expect exactly the
two `kindIcons` maps. Fix them:

- `components/SourceResultCard.tsx:37-43` → `card: CreditCard`
  (`CreditCard` is already imported there).
- `components/WeeklyDealCard.tsx:134-140` → `card: CreditCard` (already
  imported; it backs the `cashback` entry).

### Step 2 — pure mapper: `lib/sources/cardResults.ts` (new)

Pure module (imports types + `CardOffer` only — no supabase, no repos), so
tests import it with zero setup:

```ts
import type { CardOffer } from "@/lib/offers/types";
import type { DealSourceResult } from "./types";

/** Human headline for a card offer, by bonus shape. */
export function cardOfferHeadline(o: CardOffer): string {
  if (o.bonusPoints) return `${o.bonusPoints.toLocaleString("en-AU")} bonus points`;
  if (o.cashbackAmount) return `$${o.cashbackAmount} cashback`;
  if (o.statementCreditAmount) return `$${o.statementCreditAmount} statement credit`;
  return "Card offer";
}

export function cardOfferToSourceResult(o: CardOffer): DealSourceResult {
  return {
    id: `card:${o.id}`,
    source: "manual",            // admin-verified entry → "DealStack verified"
    kind: "card",
    title: `${o.provider} ${o.cardName} — ${cardOfferHeadline(o)}`,
    merchant: null,
    merchantId: null,            // product comparison, not merchant-stacking
    summary: o.offerSummary,
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: cardOfferHeadline(o), // drives the card's headline slot
    giftCardBrand: null,
    cardOrProvider: o.provider,  // already part of the search haystack
    expiryDate: o.expiryDate,
    startDate: null,
    sourceUrl: o.sourceUrl,
    publishedAt: null,
    lastCheckedAt: o.lastCheckedAt,
    confidence: o.confidence,
  };
}
```

### Step 3 — DB pool: `lib/repos/sourceResults.ts`

Following the existing pattern exactly:

- `CardOfferResultRow` interface with the columns the mapper needs
  (`id, provider, card_name, offer_type, bonus_points, cashback_amount,
  statement_credit_amount, offer_summary, source_url, expiry_date,
  last_checked_at, confidence`).
- `queryCardOffers(db)` selecting those columns from `card_offers`.
- Map rows → `CardOffer`-shaped input for `cardOfferToSourceResult`
  (numeric columns arrive as `number | string` — reuse `toNumber`/
  `toNumberOrNull` like `lib/repos/offers.ts:115-134` does; fields the
  mapper doesn't read — `minimumSpend` etc. — can be filled with nulls, or
  type the mapper's parameter as a `Pick<CardOffer, …>` to avoid fake
  values; prefer the `Pick`).
- Add `queryCardOffers(db)` to the `Promise.all` in `loadDbSourceResults`
  and spread the mapped results into the pool array.

### Step 4 — static/demo parity: `lib/sources/manualData.ts`

Append to the exported pool:
`...cardOffers.map(cardOfferToSourceResult)` (import `cardOffers` from
`@/lib/offers/manualOffers` and the helper from `./cardResults`). Check the
file's structure first — it exports `allSourceResults`; extend however that
array is assembled. No import cycle: `manualOffers` does not import from
`lib/sources` runtime modules (types only).

### Step 5 — ranking: `lib/sources/ranking.ts`

`recencyScore` (:58-65): card offers change on bank timelines, not deal
timelines — a 7-day half-life would bury them within a fortnight of their
last verification. Change the switch to:

```ts
const halfLifeDays = result.kind === "guide" || result.kind === "card" ? 60 : 7;
```

`savingsScore` needs no change: card results have `discountPercent: null`
and a non-null `pointsAmount` whose text won't match the `(\d+)\s*x`
multiplier regex, so they fall to the 0.5 presence default — acceptable
and deliberate (do not try to convert bonus points into a percent).

### Step 6 — tests

- `tests/stack/cardResults.test.ts` (new; `test:stack` runs `tests/stack`):
  - headline per shape: bonusPoints → "120,000 bonus points" (en-AU
    thousands separator), cashbackAmount → "$300 cashback",
    statementCreditAmount → "$450 statement credit", all-null → "Card
    offer".
  - mapper: `id` prefixed `card:`, `kind === "card"`, `source === "manual"`,
    `merchantId === null`, `cardOrProvider` set, `sourceUrl`/`confidence`/
    `expiryDate`/`lastCheckedAt` passed through.
  - pipeline smoke: `rankSourceResults([cardResult], "amex")` finds it
    (provider in haystack) and `rankSourceResults([cardResult], "myer")`
    does not.
- `tests/stack/ranking.test.ts`: a `card` result last checked ~30 days ago
  still outranks nothing-weird (i.e. recency ≈ 0.7, not ≈ 0.05 — assert via
  relative ordering against an identical `cashback`-kind result, not exact
  floats).

### Step 7 — verify

```bash
npm run test:stack && npm run test:monitor && npm run test:admin
npm run lint && npm run build
npm run dev   # then: /search?q=amex and /search?q=qantas (static fallback shows demo cards)
```

## Edge cases a weaker model would miss

1. **Widening `DealKind` breaks compiles you didn't open.**
   `WeeklyDealCard.kindIcons` is `Record<DealKind, LucideIcon>` — it will
   not compile until `card` is added, even though weekly cards never render
   kind `card` today. Missing the `SourceResultCard` map is worse: it is a
   plain `as const` object, and `kindIcons[result.kind]` yielding
   `undefined` renders `<undefined>` → a React crash on the whole search
   page. Fix BOTH; let `tsc` be the checklist.
2. **Do NOT add `"card"` to `DEAL_KINDS` in `sourceResults.ts`.** That
   array validates `ozbargain_signals.deal_kind` strings from the DB
   (`asDealKind`); signals can never be card offers, and widening the guard
   would let a malformed future row masquerade as one. `DEAL_KINDS` being a
   subset of `DealKind` is fine typewise.
3. **Do NOT add a card option to the admin `SignalForm`** (it keeps its own
   deliberately-duplicated deal-kind option list). Signals and card offers
   are different tables; the union widening does not mean every consumer
   accepts the new member.
4. **Do NOT invent a new `SourceId`.** The card rows are admin-verified
   manual entries → `source: "manual"` ("DealStack verified" badge, trust
   1.0). A new SourceId would ripple through `SOURCE_META`,
   `sourceBadgeClasses` in two components, and `Citation` rendering for no
   gain.
5. **`fromDbOrDemo` vs the pool's all-or-nothing fallback.** `getCardOffers`
   (the `/cards` page) deliberately never shows demo rows when Supabase is
   configured. The search pool has coarser semantics: `loadDbSourceResults`
   returns null (→ full static pool) only when Supabase is off/failed or
   the WHOLE pool is empty. Adding demo cards to `manualData` therefore
   shows them exactly when sample gift cards/signals already show — that is
   the established demo-mode behaviour; do not build a special case for
   cards.
6. **Demo rows are "Illustrative".** The seeded card offers carry
   illustrative copy and `needs-verification` confidence by design
   (`manualOffers.ts:330-336`); in demo mode they render as such. Do not
   scrub or reword them in this plan.
7. **`dedupeResults` keys on `merchantId` + saving signal** — card results
   have `merchantId: null` so each gets a `unique-N` key and never merges.
   Correct: there is no cross-source corroboration for card offers. Don't
   force a merchant id onto them to "help" dedupe.
8. **Null-amount offers:** `offer_type` alone doesn't guarantee which
   amount column is set (e.g. `annual_fee_discount` may have all three
   null) — hence the "Card offer" headline fallback; never render
   "undefined bonus points".
9. **Store pages must not regress:** `storeSourceResults` filters by
   `merchantId === storeId` (`rankSourceResultsForStore`), so merchant-less
   card results never appear on `/stores/*`. Verify once manually — that is
   intended (cards are not a per-store stacking layer, per
   `docs/public-ui-expansion-plan.md`).
10. **`expiryDate` null means evergreen** — `isExpired` returns false for
    null; most card rows currently have null expiry. Don't add your own
    expiry heuristics.

## Acceptance criteria

- [ ] With Supabase configured and 5 published card offers:
      `/search?q=amex` shows the Amex card under "Checked sources" with a
      credit-card icon, "DealStack verified" badge, and a headline like
      "120,000 bonus points"; its source link opens the bank page.
- [ ] `/search?q=<query matching only a card>` still renders the store grid
      and other sections unchanged (no crash, no card leakage into the
      store cards).
- [ ] `/stores/myer` (any store) shows **no** card results.
- [ ] `DATA_SOURCE=static npm run dev` → `/search?q=qantas` includes the
      demo Amex Qantas card (demo-mode parity).
- [ ] `npx tsc --noEmit` clean — both `kindIcons` maps extended; no other
      exhaustive map missed.
- [ ] `grep -n '"card"' lib/repos/sourceResults.ts` shows it is NOT in
      `DEAL_KINDS`; SignalForm diff is empty; `SOURCE_META` diff is empty.
- [ ] New unit tests green; all suites + lint + build pass (Node 20).
