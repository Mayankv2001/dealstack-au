"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, Store as StoreIcon } from "lucide-react";
import SearchBar from "@/components/SearchBar";
import StoreCard from "@/components/StoreCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";
import { summariseStackOutcome } from "@/lib/stack/outcome";

export function HomeSearchSections({
  stores,
  recommendations,
  heroStack,
}: {
  stores: Store[];
  recommendations: StackRecommendation[];
  heroStack: StackRecommendation | null;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`.toLowerCase().includes(needle)
  );
  const recommendationByStore = new Map(
    recommendations.map((recommendation) => [recommendation.merchantId, recommendation])
  );

  return (
    <>
      <section className="border-b bg-stone-50/70">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-20">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
              Australia’s deal-stacking platform
            </p>
            <h1 className="mt-4 max-w-2xl font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              See every saving you can stack before you buy
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Compare cashback, discounted gift cards, discount codes, points
              and reviewed community deals for Australian stores.
            </p>

            <div id="store-search" className="mt-7 max-w-2xl scroll-mt-20">
              <SearchBar
                size="lg"
                layout="split"
                value={query}
                onValueChange={setQuery}
                placeholder="Search a store, e.g. Myer, JB Hi-Fi or Amazon"
                buttonLabel="Search stores"
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button asChild variant="outline" className="bg-background">
                <a href="#stores">Browse stores</a>
              </Button>
              <Button asChild variant="ghost">
                <a href="#how-it-works">See how stacking works</a>
              </Button>
            </div>
            <p className="mt-5 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Check aria-hidden className="size-4 text-emerald-700" />
              Human-reviewed · Publicly sourced · Verify before checkout
            </p>
          </div>

          {heroStack ? <HeroReceipt recommendation={heroStack} /> : (
            <Card className="border-dashed bg-background shadow-none">
              <CardContent className="p-6 text-sm text-muted-foreground">
                No current stack is ready to feature. Search a store to review
                its available saving layers.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      <section id="stores" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-12 sm:px-6 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
              Popular stores
            </p>
            <h2 className="mt-2 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Start with where you’re shopping
            </h2>
          </div>
          {needle ? (
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : (
            <Link href="/stores" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300">
              View all stores <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>

        {filteredStores.length === 0 ? (
          <div className="mt-7 rounded-xl border border-dashed bg-card p-8 text-center">
            <StoreIcon aria-hidden className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-2 font-semibold">No stores match “{query}”</p>
            <p className="mt-1 text-sm text-muted-foreground">Try a retailer name such as Myer, JB Hi-Fi or Amazon.</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setQuery("")}>Clear search</Button>
          </div>
        ) : (
          <div className="-mx-4 mt-7 grid snap-x snap-mandatory auto-cols-[minmax(16rem,82vw)] grid-flow-col gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {filteredStores.map((store) => (
              <div key={store.id} className="snap-start">
                <StoreCard store={store} recommendation={recommendationByStore.get(store.id) ?? null} variant="stack" />
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function HeroReceipt({ recommendation }: { recommendation: StackRecommendation }) {
  const outcome = summariseStackOutcome(recommendation);
  const included = recommendation.components.filter(
    (component) =>
      !component.optional &&
      component.layer !== "points" &&
      component.layer !== "cashback" &&
      (component.valueDollars ?? 0) > 0
  );
  const alternative = recommendation.components.find((component) => component.optional);
  return (
    <Card className="bg-background shadow-sm">
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compatible example</p>
            <h2 className="mt-1 text-xl font-bold">{recommendation.merchantName} stack</h2>
          </div>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
            {recommendation.confidence === "confirmed" ? "Source checked" : "Verify layers"}
          </span>
        </div>
        <dl className="mt-4 space-y-2.5 text-sm tabular-nums">
          <ReceiptLine label="Cart" value={formatAUD(outcome.originalCart)} />
          {included.map((component, index) => (
            <ReceiptLine key={`${component.layer}-${index}`} label={component.label} value={`−${formatAUD(component.valueDollars ?? 0)}`} saving />
          ))}
          <ReceiptLine label="Checkout cost" value={formatAUD(outcome.checkoutCost)} />
          {outcome.cashbackLater > 0 ? <ReceiptLine label="Cashback expected later" value={`−${formatAUD(outcome.cashbackLater)}`} saving /> : null}
        </dl>
        <div className="mt-4 flex items-end justify-between gap-3 border-t pt-4">
          <div><p className="text-xs text-muted-foreground">Effective final cost</p><p className="text-3xl font-bold tracking-tight">{formatAUD(outcome.effectiveFinalCost)}</p></div>
          <div className="text-right text-emerald-800 dark:text-emerald-300"><p className="font-bold">Save {formatAUD(recommendation.totalSaving)}</p><p className="text-xs font-semibold">{recommendation.effectiveDiscountPercent}%</p></div>
        </div>
        {alternative ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {alternative.label} is an alternative, not an extra layer. {alternative.note}
          </p>
        ) : null}
        <Link href={`/stores/${recommendation.merchantId}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300">
          View {recommendation.merchantName}’s full stack <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Example only. Eligibility, exclusions, caps and calculation bases can vary; verify each source before checkout.
        </p>
      </CardContent>
    </Card>
  );
}

function ReceiptLine({ label, value, saving = false }: { label: string; value: string; saving?: boolean }) {
  return <div className="flex items-start justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className={saving ? "shrink-0 font-semibold text-emerald-800 dark:text-emerald-300" : "shrink-0 font-semibold"}>{value}</dd></div>;
}

export default HomeSearchSections;
