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
existing stack engine. The Deals layer never recomputes effective prices.
Gift-card and cashback savings are not combined when cashback excludes
gift-card payment; the engine selects the stronger compatible layer and exposes
the other as an alternative with a warning. Points value remains indicative
and is not deducted from cash price.

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
not receive the unpaginated pool. The compact mobile filter disclosure uses
native keyboard/focus behaviour and avoids a page-sized hydrated client
island.

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
