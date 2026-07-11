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

### Source de-duplication

A stack draws citations from every matching offer and every corroborating
OzBargain signal, so the same source repeats — once per node URL.
`summariseCitations` (`lib/stack/citationSummary.ts`) collapses them for display
without losing traceability: it dedupes by source and normalised URL, groups the
result into distinct providers ranked by trust weight, and a collapsed card
shows at most three provider badges plus an "N sources checked" count. The full,
distinct citation list stays reachable in a native `<details>` disclosure, so
every source is one keyboard-accessible interaction away.

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
