import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import CardSignupSection from "@/components/deals/CardSignupSection";
import { DealCard, DealGroupCard } from "@/components/deals/DealCard";
import DealRecommendations from "@/components/deals/DealRecommendations";
import { DealsFilters } from "@/components/deals/DealsFilters";
import FilterSelect from "@/components/deals/FilterSelect";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_LABEL,
  CATEGORY_SHORTCUTS,
  DEALS_SORTS,
  DEAL_KIND_LABEL,
  DEFAULT_PARAMS,
  MAX_SPEND,
  MIN_SPEND,
  SORT_LABEL,
  SPEND_PRESETS,
  VIEW_LABEL,
  activeFilterCount,
  dealsHref,
  parseDealsParams,
  type DealsParams,
} from "@/lib/deals/params";
import { loadDealsBundle } from "@/lib/deals/load";
import {
  deriveMerchantFacts,
  type MerchantStackFacts,
} from "@/lib/deals/merchantFacts";
import { matchDeals, queryDeals } from "@/lib/deals/query";
import {
  buildDealRecommendations,
  hasPurchaseIntent,
} from "@/lib/deals/recommend";
import { getCardOffers } from "@/lib/repos";
import { formatAUD } from "@/lib/calculateStack";
import { BEST_STACK_INITIAL_COUNT, partitionStacks } from "@/lib/stack/present";
import type { DealListItem } from "@/lib/deals/types";

export const metadata: Metadata = {
  title: "Deals & stacks | DealStack AU",
  description:
    "Find current Australian deals, gift cards, cashback, points and compatible saving stacks with clear trust and freshness labels.",
};

export const revalidate = 300;

type RawSearchParams = Record<string, string | string[] | undefined>;

/** Product examples that seed a useful electronics search in one tap. */
const SEARCH_EXAMPLES = ["MacBook Air", "AirPods", "65-inch TV", "JB Hi-Fi"];

function SearchBox({ params }: { params: DealsParams }) {
  return (
    <div className="mx-auto mt-5 max-w-3xl">
      <Form action="/deals" className="flex flex-wrap gap-2" role="search">
        <div className="relative min-w-0 flex-1 basis-64">
          <label htmlFor="deal-search" className="sr-only">
            What are you planning to buy?
          </label>
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id="deal-search"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder="Product or store, e.g. MacBook Air or JB Hi-Fi"
            className="h-11 w-full min-w-0 rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
        <label
          htmlFor="deal-spend"
          className="flex h-11 items-center gap-1.5 rounded-xl border bg-background px-3 text-sm"
        >
          <span className="text-muted-foreground">Spend $</span>
          <input
            id="deal-spend"
            name="spend"
            type="number"
            inputMode="numeric"
            min={MIN_SPEND}
            max={MAX_SPEND}
            step={10}
            defaultValue={
              params.spend !== DEFAULT_PARAMS.spend ? params.spend : undefined
            }
            placeholder="optional"
            className="w-20 bg-transparent text-sm outline-none"
          />
        </label>
        <Button type="submit" size="lg">
          Search
        </Button>
        {params.q ? (
          <Button asChild size="lg" variant="ghost">
            <Link href="/deals" aria-label="Clear search">
              <X aria-hidden />
            </Link>
          </Button>
        ) : null}
      </Form>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Try</span>
        {SEARCH_EXAMPLES.map((example) => (
          <Link
            key={example}
            href={dealsHref(DEFAULT_PARAMS, { q: example })}
            className="rounded-full border bg-background px-2.5 py-1 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {example}
          </Link>
        ))}
      </div>
      <div
        className="-mx-4 mt-2.5 overflow-x-auto px-4 [scrollbar-width:none]"
        aria-label="Electronics categories"
      >
        <div className="flex w-max gap-1.5 text-xs">
          {CATEGORY_SHORTCUTS.map((cat) => {
            const active = params.cat === cat;
            return (
              <Link
                key={cat}
                href={dealsHref(params, { cat: active ? null : cat })}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "rounded-full border border-emerald-700 bg-emerald-700 px-3 py-1.5 font-semibold text-white"
                    : "rounded-full border bg-background px-3 py-1.5 font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                }
              >
                {CATEGORY_LABEL[cat]}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PrimaryNav({ params }: { params: DealsParams }) {
  const views = [
    {
      label: "Best verified",
      view: "top" as const,
      trust: "verified" as const,
    },
    { label: "Latest", view: "recent" as const, trust: null },
    { label: "Popular", view: "popular" as const, trust: null },
    { label: "Expiring", view: "expiring" as const, trust: null },
    { label: "All deals", view: "discover" as const, trust: null },
  ];
  return (
    <nav
      aria-label="Deals sections"
      className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none]"
    >
      <div className="mx-auto flex w-max min-w-full max-w-6xl justify-start gap-1 sm:justify-center">
        {views.map(({ label, view, trust }) => {
          const active = params.view === view && params.kind == null;
          return (
            <Link
              key={label}
              href={dealsHref(DEFAULT_PARAMS, {
                view,
                trust,
                kind: null,
                page: 1,
              })}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-full bg-foreground px-3 py-2 text-xs font-semibold text-background"
                  : "rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              }
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function DealGrid({
  items,
  stores,
  now,
  facts,
}: {
  items: DealListItem[];
  stores: Awaited<ReturnType<typeof loadDealsBundle>>["stores"];
  now: Date;
  facts: Map<string, MerchantStackFacts>;
}) {
  return (
    <div className="divide-y border-y">
      {items.map((item) =>
        item.type === "deal" ? (
          <DealCard
            key={item.deal.id}
            deal={item.deal}
            stores={stores}
            now={now}
            list
            facts={
              item.deal.merchantId
                ? (facts.get(item.deal.merchantId) ?? null)
                : null
            }
          />
        ) : (
          <div key={`group:${item.group.productGroup}`} className="py-4">
            <DealGroupCard group={item.group} now={now} />
          </div>
        ),
      )}
    </div>
  );
}

function ActiveFilters({ params }: { params: DealsParams }) {
  const filters: Array<[string, string, Partial<DealsParams>]> = [];
  if (params.cat)
    filters.push(["cat", CATEGORY_LABEL[params.cat], { cat: null }]);
  if (params.maxPrice != null)
    filters.push([
      "maxPrice",
      `Up to $${params.maxPrice.toLocaleString("en-AU")}`,
      { maxPrice: null },
    ]);
  if (params.merchant)
    filters.push([
      "merchant",
      `Merchant: ${params.merchant}`,
      { merchant: null },
    ]);
  if (params.program)
    filters.push([
      "program",
      `Programme: ${params.program}`,
      { program: null },
    ]);
  if (params.trust)
    filters.push(["trust", `Trust: ${params.trust}`, { trust: null }]);
  if (params.kind)
    filters.push([
      "kind",
      `Type: ${DEAL_KIND_LABEL[params.kind]}`,
      { kind: null },
    ]);
  if (params.coupon) filters.push(["coupon", "Coupon", { coupon: false }]);
  if (params.stackable)
    filters.push(["stackable", "Stackable", { stackable: false }]);
  if (params.membership)
    filters.push(["membership", "Membership", { membership: false }]);
  if (params.activation)
    filters.push(["activation", "Activation", { activation: false }]);
  if (params.targeted)
    filters.push(["targeted", "Targeted", { targeted: false }]);
  if (params.added)
    filters.push(["added", `Added: ${params.added}`, { added: null }]);
  if (params.channel)
    filters.push([
      "channel",
      params.channel === "in-store" ? "In-store" : "Online",
      { channel: null },
    ]);
  if (params.ending)
    filters.push([
      "ending",
      params.ending === "72h" ? "Ending within 72h" : "Ending this week",
      { ending: null },
    ]);
  if (params.minSaving != null)
    filters.push([
      "minSaving",
      `Saving: ${params.minSaving}%+`,
      { minSaving: null },
    ]);
  if (!filters.length) return null;
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Active filters"
    >
      {filters.map(([key, label, override]) => (
        <Link
          key={key}
          href={dealsHref(params, override)}
          className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted"
        >
          {label}
          <X aria-hidden className="size-3" />
        </Link>
      ))}
    </div>
  );
}

/**
 * Page-level spend selector for the stack estimates: preset links plus a
 * custom amount form. One control for the whole page — cards no longer repeat
 * an "example spend" line each.
 */
function SpendSelector({ params }: { params: DealsParams }) {
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-2"
      aria-label="Spend used for stack estimates"
    >
      <span className="text-sm font-medium">Show savings on a spend of</span>
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Preset spend amounts"
      >
        {SPEND_PRESETS.map((preset) => (
          <Link
            key={preset}
            href={dealsHref(params, { spend: preset })}
            aria-current={params.spend === preset ? "true" : undefined}
            className={
              params.spend === preset
                ? "rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-lg border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            }
          >
            ${preset}
          </Link>
        ))}
      </div>
      <Form action="/deals" className="flex items-center gap-1.5">
        <input type="hidden" name="view" value="stacks" />
        <label htmlFor="custom-spend" className="sr-only">
          Custom spend amount in dollars
        </label>
        <input
          id="custom-spend"
          name="spend"
          type="number"
          inputMode="numeric"
          min={MIN_SPEND}
          max={MAX_SPEND}
          step={10}
          placeholder="Custom"
          defaultValue={
            SPEND_PRESETS.includes(
              params.spend as (typeof SPEND_PRESETS)[number],
            )
              ? undefined
              : params.spend
          }
          className="h-9 w-24 rounded-lg border bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="sm" variant="outline">
          Update
        </Button>
      </Form>
    </div>
  );
}

async function Results({
  bundle,
  params,
  now,
}: {
  bundle: Awaited<ReturnType<typeof loadDealsBundle>>;
  params: DealsParams;
  now: Date;
}) {
  if (params.view === "stacks") {
    const { best, rewards } = partitionStacks(bundle.stackRecommendations);
    const initial = best.slice(0, BEST_STACK_INITIAL_COUNT);
    const remaining = best.slice(BEST_STACK_INITIAL_COUNT);
    return (
      <section className="mt-8">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Best stacks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The strongest cash-saving combinations, calculated by DealStack’s
            engine on your selected spend.
          </p>
        </div>
        <SpendSelector params={params} />
        <div
          role="note"
          className="mb-6 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-sm text-emerald-900 dark:text-emerald-200"
        >
          <ShieldCheck
            aria-hidden
            className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <span>
            Only compatible layers are combined, points are never counted as
            cash, and the primary saving counts verified layers only. Savings
            shown on a {formatAUD(params.spend)} spend — confirm every layer at
            the source before you buy.
          </span>
        </div>
        {best.length ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {initial.map((stack, index) => (
                <StackRecommendationCard
                  key={stack.merchantId}
                  recommendation={stack}
                  stores={bundle.stores}
                  rank={index + 1}
                  now={now}
                />
              ))}
            </div>
            {remaining.length ? (
              <details className="group mt-6">
                <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  View all {best.length} stacks
                  <ChevronDown
                    aria-hidden
                    className="size-4 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {remaining.map((stack, index) => (
                    <StackRecommendationCard
                      key={stack.merchantId}
                      recommendation={stack}
                      stores={bundle.stores}
                      rank={BEST_STACK_INITIAL_COUNT + index + 1}
                      now={now}
                    />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <EmptyState filtered={false} verified={false} />
        )}

        {rewards.length ? (
          <section className="mt-12" aria-labelledby="rewards-opportunities">
            <div className="mb-1 flex items-center gap-2">
              <Star aria-hidden className="size-5 text-amber-500" />
              <h2
                id="rewards-opportunities"
                className="text-xl font-bold tracking-tight"
              >
                Rewards opportunities
              </h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Points-only opportunities — the cash price is unchanged, but you
              earn loyalty points worth chasing. Estimated points value is
              indicative, not a guaranteed cash saving.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {rewards.map((stack) => (
                <StackRecommendationCard
                  key={stack.merchantId}
                  recommendation={stack}
                  stores={bundle.stores}
                  now={now}
                />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }
  const result = queryDeals(bundle.deals, params, now);
  const facts = deriveMerchantFacts(bundle.stackRecommendations);
  const intent = hasPurchaseIntent(params);
  const recommendations = intent
    ? buildDealRecommendations(
        matchDeals(bundle.deals, params, now),
        bundle.stackRecommendations,
        bundle.stackData,
        params,
        now,
      )
    : [];
  const cardOffers = intent ? await getCardOffers() : [];
  return (
    <section className="mt-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {params.q
              ? `Results for “${params.q}”`
              : params.kind
                ? DEAL_KIND_LABEL[params.kind]
                : VIEW_LABEL[params.view]}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} active {result.total === 1 ? "result" : "results"}
            {result.pageCount > 1
              ? ` · page ${result.page} of ${result.pageCount}`
              : ""}
          </p>
        </div>
        <Form action="/deals" className="flex items-end gap-2">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          <input type="hidden" name="view" value={params.view} />
          {params.cat ? (
            <input type="hidden" name="cat" value={params.cat} />
          ) : null}
          {params.maxPrice != null ? (
            <input type="hidden" name="maxPrice" value={params.maxPrice} />
          ) : null}
          {params.merchant ? (
            <input type="hidden" name="merchant" value={params.merchant} />
          ) : null}
          {params.program ? (
            <input type="hidden" name="program" value={params.program} />
          ) : null}
          {params.trust ? (
            <input type="hidden" name="trust" value={params.trust} />
          ) : null}
          {params.kind ? (
            <input type="hidden" name="kind" value={params.kind} />
          ) : null}
          {params.coupon ? (
            <input type="hidden" name="coupon" value="1" />
          ) : null}
          {params.stackable ? (
            <input type="hidden" name="stackable" value="1" />
          ) : null}
          {params.membership ? (
            <input type="hidden" name="membership" value="1" />
          ) : null}
          {params.activation ? (
            <input type="hidden" name="activation" value="1" />
          ) : null}
          {params.targeted ? (
            <input type="hidden" name="targeted" value="1" />
          ) : null}
          {params.added ? (
            <input type="hidden" name="added" value={params.added} />
          ) : null}
          {params.channel ? (
            <input type="hidden" name="channel" value={params.channel} />
          ) : null}
          {params.ending ? (
            <input type="hidden" name="ending" value={params.ending} />
          ) : null}
          {params.minSaving != null ? (
            <input
              type="hidden"
              name="minSaving"
              value={params.minSaving}
            />
          ) : null}
          <FilterSelect
            id="deal-sort"
            label="Sort by"
            name="sort"
            defaultValue={params.sort}
          >
            {DEALS_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABEL[sort]}
              </option>
            ))}
          </FilterSelect>
          <Button type="submit" variant="outline" className="sr-only">
            Apply
          </Button>
        </Form>
      </div>
      <div className="space-y-4">
        <DealsFilters params={params} stores={bundle.stores} />
        <ActiveFilters params={params} />
        <DealRecommendations
          items={recommendations}
          stores={bundle.stores}
          spend={params.spend}
          now={now}
        />
        {params.view === "popular" ? (
          <p className="rounded-lg border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
            Popularity uses captured comment and vote counts for discovery. It
            does not prove that an offer is current or compatible.
          </p>
        ) : null}
        {recommendations.length > 0 && result.items.length ? (
          <h2 className="pt-2 text-lg font-bold">All matching offers</h2>
        ) : null}
        {result.items.length ? (
          <DealGrid
            items={result.items}
            stores={bundle.stores}
            now={now}
            facts={facts}
          />
        ) : (
          <EmptyState
            filtered={activeFilterCount(params) > 0 || Boolean(params.q)}
            verified={params.view === "top" || params.trust === "verified"}
          />
        )}
        {result.pageCount > 1 ? (
          <nav
            aria-label="Results pages"
            className="mt-8 flex items-center justify-center gap-3"
          >
            {result.page > 1 ? (
              <Button asChild variant="outline">
                <Link href={dealsHref(params, { page: result.page - 1 })}>
                  <ArrowLeft aria-hidden /> Previous
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                <ArrowLeft aria-hidden /> Previous
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              Page {result.page} of {result.pageCount}
            </span>
            {result.page < result.pageCount ? (
              <Button asChild variant="outline">
                <Link href={dealsHref(params, { page: result.page + 1 })}>
                  Next <ArrowRight aria-hidden />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" disabled>
                Next <ArrowRight aria-hidden />
              </Button>
            )}
          </nav>
        ) : null}
        <CardSignupSection offers={cardOffers} spend={params.spend} />
      </div>
    </section>
  );
}

function EmptyState({
  filtered,
  verified,
}: {
  filtered: boolean;
  verified: boolean;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center">
      <SlidersHorizontal
        aria-hidden
        className="mx-auto size-8 text-muted-foreground"
      />
      <h2 className="mt-3 text-lg font-semibold">
        {verified
          ? "No currently verified offers are available."
          : filtered
            ? "No deals match those choices"
            : "No active deals are available"}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {verified
          ? "Latest, Expiring and All deals may still contain reviewed listings that need another check."
          : filtered
            ? "Remove a filter or try a broader search. We never fill an empty production result with demo records."
            : "Published offers will appear here when they pass the public approval boundary."}
      </p>
      <Button asChild variant="outline" className="mt-4">
        <Link href="/deals">Clear search and filters</Link>
      </Button>
    </div>
  );
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = parseDealsParams(await searchParams);
  const now = new Date();
  const bundle = await loadDealsBundle(now, params.spend);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page-container flex-1 py-7 sm:py-10">
        <header className="border-b pb-6 text-left sm:pb-8">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
            <ShieldCheck aria-hidden className="size-3.5" /> Reviewed listings
            with clear source and freshness labels
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
            What are you planning to buy?
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Search a product or store to see the best current route — checkout
            price, later cashback and points shown separately, with every
            layer&rsquo;s compatibility stated up front.
          </p>
          <SearchBox params={params} />
          <PrimaryNav params={params} />
        </header>
        {bundle.partial ? (
          <div
            role="status"
            className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
          >
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />{" "}
            Some deal sources could not be loaded. Available results are shown
            and may be incomplete.
          </div>
        ) : null}
        <Results bundle={bundle} params={params} now={now} />
        <aside className="mt-12 rounded-xl border bg-card p-5 sm:flex sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">How DealStack checks offers</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Learn what trust labels mean and what to verify before checkout.
            </p>
          </div>
          <Button asChild variant="outline" className="mt-3 sm:mt-0">
            <Link href="/resources">Read the guide</Link>
          </Button>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
