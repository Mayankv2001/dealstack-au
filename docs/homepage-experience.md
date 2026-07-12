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
