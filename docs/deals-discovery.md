# Public Deals discovery

`/deals` is DealStack AU's focused public discovery surface. It replaces the
former long, client-filtered Weekly Deals feed with a server-rendered route that
helps a shopper find a current deal or compatible stack quickly.

## Information architecture

The primary URL-backed views are Discover, Top deals, Best stacks, Gift cards,
Cashback, Points, Community and Expiring soon. Discover is intentionally
curated and bounded: one featured stack, small trusted/recent/expiring sets and
one selected opportunity from each saving-layer family. It never renders the
complete community dataset on first load.

Any explicit view, search or filter enters results mode. Results render 24
grouped list items per page. Page numbers beyond the available set are clamped
to the last page. Search, filters, sort and pagination live in the URL so links
are shareable and browser back/forward navigation works without a client-side
data copy.

## Search, filters and sorting

Search is tokenised and case-insensitive. Every token must match the normalised
public haystack, which includes title, summary, merchant, category, tags,
coupon, source, offer kind and source-specific product/programme terms.

Visible filters are limited to stored facts: merchant, loyalty programme,
trust status, added today/week, coupon, stackable, membership required,
activation required and targeted. Expiring soon and offer families are primary
views. Active filters are removable individually or together.

Sorts are Recommended, Newly added, Expiring soon, Biggest saving, Lowest
price and Recently checked. Recommended is a deterministic score combining
trust, freshness, saving, expiry urgency, completeness, stackability and the
available community engagement signal. Expired records are removed before any
ranking.

## Normalisation and grouping

`lib/deals/normalise.ts` maps published weekly picks, gift-card offers,
cashback, points and approved community signals into `PublicDeal`. Listings
contain short public fields only; raw feed payloads, moderation fields and
admin data never enter the model.

Deduplication prefers stable source-native ids. The fallback key includes kind,
merchant, title, price, coupon and eligibility/channel conditions so targeted,
membership, state/channel or materially different offers are not merged.
Product comparison is only enabled by an admin-assigned `product_group` with at
least two active offers and compatible conditions. No grouping is inferred and
no demonstration groups are invented.

## Trust and freshness

Public vocabulary is:

- Verified by DealStack: the underlying offer has `confidence=confirmed`.
- Source checked: a named-source curated offer that still requires checkout
  verification.
- Community reported: an approved community signal whose public price and
  terms are not represented as independently verified.
- Price may have changed: the newest checked/posted timestamp is over 14 days
  old.
- Expired: retained only on historical editorial detail pages; active listings
  exclude it.

Expiry uses `lib/offers/expiry.ts`: Australia/Sydney calendar dates, live on the
stated expiry day, and expired only after that day. The request render time is
injected into cards so relative labels are deterministic and do not hydrate
against a second browser clock.

## Stack calculations

Best stacks and the featured stack render `StackRecommendation` values from the
existing stack engine (`lib/stack/buildStack.ts`). The Deals layer never
recomputes effective prices or which layers are compatible; presentation helpers
in `lib/stack/present.ts` only read fields the engine already produced.

Gift-card and cashback savings are not combined when cashback excludes gift-card
payment; the engine selects the stronger compatible layer, marks it
non-optional, and exposes the other as an `optional` alternative with a
risk warning. A layer that saves nothing (for example a 0%-discount gift card
that only earns bonus points) is never added as a cash layer, so "0% off" is
never shown.

### What qualifies as a Best stack

`partitionStacks` splits raw engine output into two shopper-facing groups:

- **Best stacks** — cash-saving stacks (`kind === "cash"`) with a positive total
  saving, an effective discount of at least
  `MIN_BEST_STACK_DISCOUNT_PERCENT` (1%), and at least one non-optional
  discount / gift-card / cashback layer that actually reduces the price. They are
  ranked by cash saving, then effective discount, then confidence, then a stable
  merchant tiebreak. Only the strongest `BEST_STACK_INITIAL_COUNT` (5) show
  first; the rest sit behind a "View all stacks" disclosure.
- **Rewards opportunities** — points-only stacks (`kind === "points-only"`),
  where the cash price is unchanged. These render a dedicated card showing the
  unchanged cash price, the approximate points earned and an indicative points
  value that is explicitly **not** deducted from the cash price and never claimed
  as a guaranteed cash saving.

Stacks that neither save cash nor earn points are dropped from both groups.

### Spend selector

The Best stacks view carries one page-level spend selector — presets of $100,
$250 and $500 plus a custom amount (clamped to $50–$20,000) — driven by the
`spend` URL parameter. The engine recalculates every stack server-side at the
selected spend; cards phrase the outcome as "on a $X spend" and never repeat a
per-card "example spend" line. The parameter is display configuration, not a
filter: setting it alone keeps the Discover layout.

### Verified vs estimated savings

Every recommendation carries `verifiedSaving` — the subset of `totalSaving`
backed by CONFIRMED cash layers only. The card headline leads with the verified
figure ("You save $X"); anything above it is explicitly labelled
"Up to $Y including unverified layers", and when nothing is verified the
headline itself is labelled an estimate. Each layer row also carries its own
Verified/Unverified chip, so one unverified layer can never make a stack read
as fully verified. Descriptive titles are derived from the actual layers
("10% off code + 6% ShopBack cashback at Myer") — never a generic label.

### Freshness

Each recommendation exposes `checkedAsOf` (the OLDEST last-checked date among
the used offer-backed layers, so currency is never overstated) and
`soonestExpiry` (the first layer to end). Cards render these as one freshness
row ("Layers checked 25 Jun 2026 · First layer ends 31 Jul 2026") with
Australia-local dates.

### Source de-duplication

A stack draws citations from its matching offers and corroborating OzBargain
signals. Two mechanisms keep that honest and compact:

1. **At the engine** (`lib/stack/buildStack.ts`), corroborating community
   citations are capped at `MAX_SIGNAL_CITATIONS` (3), keeping the most
   recently checked REAL signals; sample rows are never cited. This fixes the
   root cause of the repeated-badge flood (one citation per approved signal —
   busy merchants have dozens; `ozbargain_signals.source_native_id` is unique,
   so these were distinct rows, not database duplicates).
2. **At display**, `summariseCitations` (`lib/stack/citationSummary.ts`)
   dedupes by source and normalised canonical URL, groups the result into
   distinct providers ranked by trust weight, and a collapsed card shows at
   most three provider badges plus an "N sources checked" count. The full,
   distinct citation list stays reachable in a native `<details>` disclosure,
   so every source is one keyboard-accessible interaction away.

### Conditions

Warnings are consolidated into one compact conditions row: the single most
severe condition renders inline and the rest sit behind a native "View N more
conditions" disclosure — replacing the old stack of repeated warning banners.

### Trust and compatibility presentation

Each card shows one stack-level trust line derived from the engine's
worst-of-component confidence and its verification warnings ("All layers source
checked", "1 layer needs verification", "Terms may have changed") instead of
repeating a per-citation "verified" badge. Community corroboration is never
presented as price or terms verification. Per-layer confidence detail remains
available in the card's expanded sections.

Layer compatibility is explicit: combinable layers are badged "Can be combined"
and the mutually exclusive side of a gift-card/cashback conflict is badged
"Choose one", mirroring the engine's `optional` flag. Generic "check before you
buy" text is replaced by one trust notice beside the page heading; within a card
only stack-specific warnings appear (expiry soon, needs verification, cap
reached, gift-card/cashback conflict, stale data), each with human-readable
Australia-local dates rather than raw ISO strings.

## Publication and failure boundaries

Public repositories use the anonymous Supabase client. RLS limits offers and
weekly deals to `is_published=true`, signals to `status='approved'`, and stores
to published rows. Repository reads apply the Australia-local expiry guard.
The Deals route does not use the service-role client, private queue/feed tables,
admin notes or raw monitoring rows. Sample records never render placeholder
source links.

Supabase remains authoritative when configured: empty or failed production
reads are not replaced by static demo content. The route has explicit empty,
partial and uncaught-error UI. Independent stack/weekly loads are settled so a
top-level source failure can preserve available public content.

## Components and tests

The route is a Server Component. URL parsing, normalisation, filtering,
deduplication, grouping, sorting and pagination execute on the server; cards do
not receive the unpaginated pool. The compact mobile filter disclosure and the
per-card source disclosure use native `<details>` keyboard/focus behaviour and
avoid a page-sized hydrated client island. The only client island on a stack
card is the copy-code button, which reports success through an `aria-live`
region and degrades gracefully without the Clipboard API.

Stack behaviour is covered by `tests/stack/citationSummary.test.ts` (source
de-duplication, counts, preserved traceability), `tests/stack/present.test.ts`
(Best-stack qualification, points-only routing, ranking, trust status, layer
compatibility), `tests/stack/buildStack.test.ts` (no sample/internal wording,
outcome-based titles, cash vs points-only classification, copyable codes) and
`tests/stack/stackRecommendationCard.test.tsx` (collapsed sources, single trust
line, no raw ISO dates, points-not-deducted, "Choose one" and copy-code).

Run:

```bash
npm run test:deals
npm run test:stack
npm run test:monitor
npm run test:admin
npm run lint
npm run build
npm run test:e2e
```

The focused Deals tests cover URL parsing/legacy compatibility, serialisation,
tokenised search, combined filters, AU expiry, conservative deduplication,
condition-safe product grouping, sorting, page clamping, trust mapping, source
URL suppression and search normalisation.
