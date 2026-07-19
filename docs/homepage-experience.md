# Homepage product experience

The homepage follows one focused journey: understand DealStack, search for a
store, inspect a compatible stack, browse stores and reviewed opportunities,
calculate a basket, then review sourcing evidence and limitations.

## Calculation source of truth

Sourced homepage examples use `StackRecommendation` output from
`lib/stack/buildStack.ts`. `lib/stack/outcome.ts` only separates that output
into shopper-facing cash-flow stages: original cart, merchant checkout cost,
gift-card saving, cash paid, cashback expected later, effective final cost and
points shown separately. It never changes eligibility or recomputes layers.

The custom calculator uses `lib/calculateStack.ts`. It follows the same order
and cashback base. When cashback excludes gift-card payment, the shared helper
keeps only the stronger layer and exposes which layer was excluded.

The current static Myer data illustrates why this distinction matters. A
theoretical 10% code + 4% gift card + 6% cashback calculation is `$405` on a
`$500` cart. The sourced cashback terms exclude gift-card payment, so the
engine-backed store result uses the 10% code and 6% cashback, producing `$423`.

## Publication and trust

Community opportunity rows continue to come from `getTopDeals()`: imported
feed items linked to approved, non-sample, non-expired public signals. Raw feed
copy, unreviewed rows and hidden signals are not rendered. When no approved
rows exist, the homepage explains the empty state instead of substituting
demo opportunities.

Store and featured-stack freshness, warnings, confidence and source links are
derived from the existing stack engine and repository data. Missing values use
truthful fallback states such as “Watching for offers” and “No checked time
available”.

## “This week’s gift-card offers” carousel

The homepage gift-card section (`components/home/OfferMarquee.tsx`, built from
`lib/giftcards/marquee.ts`) is a responsive, paged carousel: **three cards on
desktop, two on tablet, one on mobile**, grouped into pages of that many.
Previous/next move by a whole page; the counter and dots track **pages**
(e.g. `1 / 3`), not individual offers. Native CSS scroll-snap drives the track,
so touch/trackpad swipe works, and the current page is read back from scroll
position. Smoothness is controlled by the `scrollTo` `behavior` option and
`prefers-reduced-motion` — deliberately **not** a CSS `scroll-smooth` class,
because some engines make a programmatic smooth `scrollTo` a no-op when CSS
`scroll-behavior` is already smooth.

### Which offers it shows (and why it is not the strict stack set)

The carousel reads `getCurrentReviewedGiftCardOffers({ limit, orderBy })`
(`lib/repos/offers.ts`), **not** the `data.giftCardOffers` the stack engine
consumes. Both start from the same RLS-published rows, but they apply different
date boundaries:

- **Stack engine** — `getGiftCardOffers()` applies the strict
  `filterConfirmedCurrentOffers` boundary (`lib/giftcards/lifecycle.ts`): a row
  is dropped unless its Sydney date window is *confirmed* open. An unknown
  expiry never counts, because an unconfirmed date must not drive a calculation.
- **Display surfaces** — `getCurrentReviewedGiftCardOffers()` keeps reviewed,
  published offers whose expiry is merely *unknown* and ranks them **last**,
  behind every dated offer, honestly labelled “Date unknown” / “Ongoing” — never
  as a confirmed expiry. Only two states are ever removed: a confirmed end date
  that has passed, and a start date still in the future. Selection and ordering
  are the shared, deterministic rules in `lib/giftcards/currentOffers.ts`
  (ending soonest → unknown-expiry last → most-recently-checked → offer id).

Nothing unreviewed is ever surfaced — the input is the RLS-published set — and
no demo data is substituted in production.

### Operational step: backfill undated GCDB offers (queued, not automated)

The change above deliberately **surfaces** approved offers that were published
from the GCDB ingest without an `expiry_date`/`start_date` and without
`is_ongoing = true` (they classify as “unknown date”). Showing them ranked-last
is correct, but the durable fix is a data-quality one, and it stays behind the
**admin approval boundary** (see `docs/gift-card-source-policy.md`): a reviewer
should backfill each row with either a real `expiry_date` (when the source
states one) or `is_ongoing = true` (genuine while-stocks-last offers). Once a
row has a confirmed date state it also re-enters the strict stack-engine set.
Do **not** auto-fill dates from an unattended job — that would fabricate a date
the source did not assert.
