import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronDown, Layers3, Search, ShieldCheck, SlidersHorizontal, Star, X } from "lucide-react";
import { DealCard, DealGroupCard } from "@/components/deals/DealCard";
import { DealsFilters } from "@/components/deals/DealsFilters";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import { Button } from "@/components/ui/button";
import {
  DEALS_SORTS,
  DEALS_VIEWS,
  DEFAULT_PARAMS,
  SORT_LABEL,
  VIEW_LABEL,
  activeFilterCount,
  dealsHref,
  isDiscoverMode,
  parseDealsParams,
  type DealsParams,
} from "@/lib/deals/params";
import { loadDealsBundle } from "@/lib/deals/load";
import { queryDeals } from "@/lib/deals/query";
import { formatAUD } from "@/lib/calculateStack";
import { DEFAULT_SPEND } from "@/lib/stack/buildStack";
import { BEST_STACK_INITIAL_COUNT, partitionStacks } from "@/lib/stack/present";
import type { DealListItem, PublicDealKind } from "@/lib/deals/types";

export const metadata: Metadata = {
  title: "Deals & stacks | DealStack AU",
  description: "Find current Australian deals, gift cards, cashback, points and compatible saving stacks with clear trust and freshness labels.",
};

export const revalidate = 300;

type RawSearchParams = Record<string, string | string[] | undefined>;

function SearchBox({ params }: { params: DealsParams }) {
  return (
    <Form action="/deals" className="relative mx-auto mt-5 flex max-w-3xl gap-2" role="search">
      <label htmlFor="deal-search" className="sr-only">Search public deals</label>
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input id="deal-search" name="q" type="search" defaultValue={params.q} placeholder="Search products, merchants, coupons or programmes" className="h-11 min-w-0 flex-1 rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      <Button type="submit" size="lg">Search</Button>
      {params.q ? <Button asChild size="lg" variant="ghost"><Link href="/deals" aria-label="Clear search"><X aria-hidden /></Link></Button> : null}
    </Form>
  );
}

function PrimaryNav({ params }: { params: DealsParams }) {
  return (
    <nav aria-label="Deals sections" className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none]">
      <div className="mx-auto flex w-max min-w-full max-w-6xl justify-start gap-1 sm:justify-center">
        {DEALS_VIEWS.map((view) => <Link key={view} href={dealsHref(DEFAULT_PARAMS, { view, page: 1 })} aria-current={params.view === view ? "page" : undefined} className={params.view === view ? "rounded-full bg-foreground px-3 py-2 text-xs font-semibold text-background" : "rounded-full px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"}>{VIEW_LABEL[view]}</Link>)}
      </div>
    </nav>
  );
}

function DealGrid({ items, stores, now }: { items: DealListItem[]; stores: Awaited<ReturnType<typeof loadDealsBundle>>["stores"]; now: Date }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => item.type === "deal" ? <DealCard key={item.deal.id} deal={item.deal} stores={stores} now={now} /> : <DealGroupCard key={`group:${item.group.productGroup}`} group={item.group} now={now} />)}</div>;
}

function Section({ title, description, items, stores, now, href }: { title: string; description: string; items: DealListItem[]; stores: Awaited<ReturnType<typeof loadDealsBundle>>["stores"]; now: Date; href: string }) {
  if (items.length === 0) return null;
  return <section className="mt-10" aria-labelledby={`section-${title.replace(/\W+/g, "-").toLowerCase()}`}><div className="mb-4 flex items-end justify-between gap-4"><div><h2 id={`section-${title.replace(/\W+/g, "-").toLowerCase()}`} className="text-xl font-bold tracking-tight">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><Link href={href} className="hidden shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex">See all <ArrowRight aria-hidden className="size-4" /></Link></div><DealGrid items={items} stores={stores} now={now} /></section>;
}

function discoverItems(deals: Awaited<ReturnType<typeof loadDealsBundle>>["deals"], params: DealsParams, now: Date, overrides: Partial<DealsParams>, count: number) {
  return queryDeals(deals, { ...params, ...overrides, page: 1 }, now).items.slice(0, count);
}

function Discover({ bundle, params, now }: { bundle: Awaited<ReturnType<typeof loadDealsBundle>>; params: DealsParams; now: Date }) {
  const featuredStack = partitionStacks(bundle.stackRecommendations).best[0];
  const top = discoverItems(bundle.deals, params, now, { view: "top", trust: "verified" }, 6);
  const fallbackTop = top.length ? top : discoverItems(bundle.deals, params, now, { view: "top" }, 6);
  const recent = discoverItems(bundle.deals, params, now, { view: "top", sort: "newest" }, 6);
  const expiring = discoverItems(bundle.deals, params, now, { view: "expiring", sort: "expiring" }, 3);
  const opportunities = (["gift-card", "cashback", "points"] as PublicDealKind[]).flatMap((kind) => {
    const view = kind === "gift-card" ? "gift-cards" : kind;
    return discoverItems(bundle.deals, params, now, { view: view as DealsParams["view"] }, 1);
  });
  return <>
    {featuredStack ? <section className="mt-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 sm:p-6" aria-labelledby="featured-stack"><div className="mb-4 flex items-start justify-between gap-4"><div><p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400"><Layers3 aria-hidden className="size-4" /> DealStack advantage</p><h2 id="featured-stack" className="mt-1 text-xl font-bold">Best compatible stack</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">A traced combination from the stack engine. Incompatible gift-card and cashback layers are never added together.</p></div><Button asChild variant="outline" className="hidden bg-background sm:inline-flex"><Link href={dealsHref(params, { view: "stacks" })}>All stacks</Link></Button></div><StackRecommendationCard recommendation={featuredStack} stores={bundle.stores} /></section> : null}
    <Section title="Top trusted deals" description="Strong current offers prioritised by trust, completeness and saving." items={fallbackTop} stores={bundle.stores} now={now} href={dealsHref(params, { view: "top" })} />
    <Section title="Recently added" description="Fresh public deals without the full community feed." items={recent} stores={bundle.stores} now={now} href={dealsHref(params, { view: "top", sort: "newest" })} />
    <Section title="Expiring soon" description="Active offers ending within seven Australia-local calendar days." items={expiring} stores={bundle.stores} now={now} href={dealsHref(params, { view: "expiring" })} />
    <Section title="More ways to save" description="Selected gift-card, cashback and points opportunities." items={opportunities} stores={bundle.stores} now={now} href={dealsHref(params, { view: "top" })} />
    <div className="mt-10 rounded-2xl border bg-card p-6 text-center"><h2 className="text-lg font-semibold">Want the complete current list?</h2><p className="mt-1 text-sm text-muted-foreground">Browse all active public records with filters, sorting and shareable URLs.</p><Button asChild className="mt-4"><Link href={dealsHref(params, { view: "top" })}>Browse all deals <ArrowRight aria-hidden /></Link></Button></div>
  </>;
}

function ActiveFilters({ params }: { params: DealsParams }) {
  const filters: Array<[string, string, Partial<DealsParams>]> = [];
  if (params.merchant) filters.push(["merchant", `Merchant: ${params.merchant}`, { merchant: null }]);
  if (params.program) filters.push(["program", `Programme: ${params.program}`, { program: null }]);
  if (params.trust) filters.push(["trust", `Trust: ${params.trust}`, { trust: null }]);
  if (params.coupon) filters.push(["coupon", "Coupon", { coupon: false }]);
  if (params.stackable) filters.push(["stackable", "Stackable", { stackable: false }]);
  if (params.membership) filters.push(["membership", "Membership", { membership: false }]);
  if (params.activation) filters.push(["activation", "Activation", { activation: false }]);
  if (params.targeted) filters.push(["targeted", "Targeted", { targeted: false }]);
  if (params.added) filters.push(["added", `Added: ${params.added}`, { added: null }]);
  if (!filters.length) return null;
  return <div className="flex flex-wrap items-center gap-2" aria-label="Active filters">{filters.map(([key, label, override]) => <Link key={key} href={dealsHref(params, override)} className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted">{label}<X aria-hidden className="size-3" /></Link>)}</div>;
}

function Results({ bundle, params, now }: { bundle: Awaited<ReturnType<typeof loadDealsBundle>>; params: DealsParams; now: Date }) {
  if (params.view === "stacks") {
    const { best, rewards } = partitionStacks(bundle.stackRecommendations);
    const initial = best.slice(0, BEST_STACK_INITIAL_COUNT);
    const remaining = best.slice(BEST_STACK_INITIAL_COUNT);
    return (
      <section className="mt-8">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Best stacks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The strongest cash-saving combinations, calculated by DealStack’s engine.
          </p>
        </div>
        <div role="note" className="mb-6 flex items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-sm text-emerald-900 dark:text-emerald-200">
          <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>Only compatible layers are combined and points are never counted as cash. Each stack shows an example on a {formatAUD(DEFAULT_SPEND)} purchase — confirm every layer at the source before you buy.</span>
        </div>
        {best.length ? (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              {initial.map((stack, index) => (
                <StackRecommendationCard key={stack.merchantId} recommendation={stack} stores={bundle.stores} rank={index + 1} />
              ))}
            </div>
            {remaining.length ? (
              <details className="group mt-6">
                <summary className="mx-auto flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                  View all {best.length} stacks
                  <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {remaining.map((stack, index) => (
                    <StackRecommendationCard key={stack.merchantId} recommendation={stack} stores={bundle.stores} rank={BEST_STACK_INITIAL_COUNT + index + 1} />
                  ))}
                </div>
              </details>
            ) : null}
          </>
        ) : <EmptyState filtered={false} />}

        {rewards.length ? (
          <section className="mt-12" aria-labelledby="rewards-opportunities">
            <div className="mb-1 flex items-center gap-2">
              <Star aria-hidden className="size-5 text-amber-500" />
              <h2 id="rewards-opportunities" className="text-xl font-bold tracking-tight">Rewards opportunities</h2>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Points-only opportunities — the cash price is unchanged, but you earn loyalty points worth chasing. Estimated points value is indicative, not a guaranteed cash saving.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {rewards.map((stack) => (
                <StackRecommendationCard key={stack.merchantId} recommendation={stack} stores={bundle.stores} />
              ))}
            </div>
          </section>
        ) : null}
      </section>
    );
  }
  const result = queryDeals(bundle.deals, params, now);
  return (
    <section className="mt-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{params.q ? `Results for “${params.q}”` : VIEW_LABEL[params.view]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.total} active {result.total === 1 ? "result" : "results"}
            {result.pageCount > 1 ? ` · page ${result.page} of ${result.pageCount}` : ""}
          </p>
        </div>
        <Form action="/deals" className="flex items-end gap-2">
          {params.q ? <input type="hidden" name="q" value={params.q} /> : null}
          <input type="hidden" name="view" value={params.view} />
          {params.merchant ? <input type="hidden" name="merchant" value={params.merchant} /> : null}
          {params.program ? <input type="hidden" name="program" value={params.program} /> : null}
          {params.trust ? <input type="hidden" name="trust" value={params.trust} /> : null}
          {params.coupon ? <input type="hidden" name="coupon" value="1" /> : null}
          {params.stackable ? <input type="hidden" name="stackable" value="1" /> : null}
          {params.membership ? <input type="hidden" name="membership" value="1" /> : null}
          {params.activation ? <input type="hidden" name="activation" value="1" /> : null}
          {params.targeted ? <input type="hidden" name="targeted" value="1" /> : null}
          {params.added ? <input type="hidden" name="added" value={params.added} /> : null}
          <label className="grid gap-1 text-xs font-medium" htmlFor="deal-sort">
            Sort by
            <select id="deal-sort" name="sort" defaultValue={params.sort} className="h-9 rounded-lg border bg-background px-2 text-sm">
              {DEALS_SORTS.map((sort) => <option key={sort} value={sort}>{SORT_LABEL[sort]}</option>)}
            </select>
          </label>
          <Button type="submit" variant="outline">Apply</Button>
        </Form>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row">
        <DealsFilters params={params} stores={bundle.stores} />
        <div className="min-w-0 flex-1">
          <ActiveFilters params={params} />
          {result.items.length ? (
            <div className="mt-4"><DealGrid items={result.items} stores={bundle.stores} now={now} /></div>
          ) : <EmptyState filtered={activeFilterCount(params) > 0 || Boolean(params.q)} />}
          {result.pageCount > 1 ? (
            <nav aria-label="Results pages" className="mt-8 flex items-center justify-center gap-3">
              {result.page > 1 ? (
                <Button asChild variant="outline"><Link href={dealsHref(params, { page: result.page - 1 })}><ArrowLeft aria-hidden /> Previous</Link></Button>
              ) : <Button variant="outline" disabled><ArrowLeft aria-hidden /> Previous</Button>}
              <span className="text-sm text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? (
                <Button asChild variant="outline"><Link href={dealsHref(params, { page: result.page + 1 })}>Next <ArrowRight aria-hidden /></Link></Button>
              ) : <Button variant="outline" disabled>Next <ArrowRight aria-hidden /></Button>}
            </nav>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return <div className="mt-4 rounded-2xl border border-dashed bg-card p-10 text-center"><SlidersHorizontal aria-hidden className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">{filtered ? "No deals match those choices" : "No active deals are available"}</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{filtered ? "Remove a filter or try a broader search. We never fill an empty production result with demo records." : "Published offers will appear here when they pass the public approval boundary."}</p><Button asChild variant="outline" className="mt-4"><Link href="/deals">Clear search and filters</Link></Button></div>;
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const params = parseDealsParams(await searchParams);
  const now = new Date();
  const bundle = await loadDealsBundle(now);
  const discover = isDiscoverMode(params);
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.035]"><SiteHeader /><main className="mx-auto w-full max-w-6xl flex-1 px-4 py-7 sm:px-6"><header className="text-center"><div className="mx-auto inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-300"><ShieldCheck aria-hidden className="size-3.5" /> Public, current and clearly sourced</div><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Find a deal worth stacking</h1><p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">Search trusted Australian offers, compare conditions and see compatible saving layers before you buy.</p><SearchBox params={params} /><PrimaryNav params={params} /></header>{bundle.partial ? <div role="status" className="mt-6 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"><AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> Some deal sources could not be loaded. Available results are shown and may be incomplete.</div> : null}{discover ? <Discover bundle={bundle} params={params} now={now} /> : <Results bundle={bundle} params={params} now={now} />}<aside className="mt-12 rounded-xl border bg-card p-5 sm:flex sm:items-center sm:justify-between"><div><h2 className="font-semibold">How DealStack checks offers</h2><p className="mt-1 text-sm text-muted-foreground">Learn what trust labels mean and what to verify before checkout.</p></div><Button asChild variant="outline" className="mt-3 sm:mt-0"><Link href="/resources">Read the guide</Link></Button></aside></main><SiteFooter /></div>;
}
