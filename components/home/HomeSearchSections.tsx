"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SearchBar from "@/components/SearchBar";
import StoreCard, { SAMPLE_SPEND } from "@/components/StoreCard";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { FeaturedStack } from "@/components/home/featured";
import { cn } from "@/lib/utils";

/**
 * The query-coupled slice of the homepage: the hero search box live-filters
 * the "Popular stores" grid further down, so both live in one client island.
 * The static "savings layers" section that sits between them in the DOM is
 * server-rendered and threaded through as `savingsSlot` — the RSC
 * interleaving pattern keeps it out of the client bundle.
 */

export function HomeSearchSections({
  stores,
  featured,
  savingsSlot,
}: {
  stores: Store[];
  featured: FeaturedStack | null;
  savingsSlot: React.ReactNode;
}) {
  const [query, setQuery] = useState("");

  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-emerald-500/[0.07] via-transparent to-transparent"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Australia’s deal-stacking platform
            </span>
            <h1 className="mt-5 font-serif text-[2.75rem] font-bold leading-[1.04] tracking-tight sm:text-6xl">
              Stack every saving before you shop
            </h1>
            <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
              Combine{" "}
              <strong className="font-semibold text-foreground">
                cashback
              </strong>
              ,{" "}
              <strong className="font-semibold text-foreground">
                discounted gift cards
              </strong>
              ,{" "}
              <strong className="font-semibold text-foreground">
                loyalty points
              </strong>{" "}
              and curated{" "}
              <strong className="font-semibold text-foreground">
                community deal signals
              </strong>{" "}
              into one stacked discount — so you pay the lowest possible
              effective price.
            </p>

            <div className="mt-7 max-w-xl">
              <SearchBar
                size="lg"
                layout="split"
                value={query}
                onValueChange={setQuery}
                placeholder="Search stores or products…"
                buttonLabel="Search deals"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Button asChild variant="outline" className="bg-background">
                <a href="#stores">
                  Browse stores
                  <ArrowRight className="size-4" />
                </a>
              </Button>
              <p className="text-sm text-muted-foreground">
                Manually curated · No scraping · Verify before buying
              </p>
            </div>
          </div>

          {/* Live $500 stack teaser */}
          {featured && (
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-4 -z-10 rounded-[32px] bg-emerald-500/10 blur-2xl"
              />
              <Card className="rounded-3xl shadow-xl shadow-emerald-900/[0.08]">
                <CardContent className="p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Your stack · {formatAUD(SAMPLE_SPEND)} cart
                    </span>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      Save {featured.stack.totalSavingPercent}%
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="font-serif text-5xl font-bold tracking-tight">
                      {formatAUD(featured.stack.finalEffectivePrice)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      effective
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    down from {formatAUD(SAMPLE_SPEND)}
                  </p>

                  <dl className="mt-6 space-y-3 text-sm">
                    {featured.stack.discountSaving > 0 && (
                      <TeaserLine
                        dotClass="bg-primary"
                        label={`Discount code (${featured.store.discountPercent}%)`}
                        value={featured.stack.discountSaving}
                      />
                    )}
                    {featured.stack.giftCardSaving > 0 && (
                      <TeaserLine
                        dotClass="bg-sky-600"
                        label="Discounted gift card"
                        value={featured.stack.giftCardSaving}
                      />
                    )}
                    {featured.stack.estimatedCashback > 0 && (
                      <TeaserLine
                        dotClass="bg-emerald-500"
                        label={`Cashback (${featured.store.cashbackPercent}%)`}
                        value={featured.stack.estimatedCashback}
                      />
                    )}
                  </dl>

                  <div className="mt-5 flex items-center justify-between border-t border-dashed pt-4">
                    <span className="font-medium">Total saved</span>
                    <span className="font-serif text-xl font-bold text-emerald-700 dark:text-emerald-400">
                      {formatAUD(featured.stack.totalSaving)}
                    </span>
                  </div>

                  <Link
                    href={`/stores/${featured.store.id}`}
                    className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    See {featured.store.name}’s full stack
                    <ArrowRight className="size-3.5" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </section>

      {/* Savings layers — server-rendered, threaded through as a slot. */}
      {savingsSlot}

      {/* Popular stores */}
      <section id="stores" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Popular stores
            </p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Where Australians stack the most
            </h2>
          </div>
          {query.trim() ? (
            <Button
              variant="outline"
              size="sm"
              className="bg-background"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          ) : (
            <Link
              href="/search"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
            >
              View all stores
              <ArrowRight className="size-4" />
            </Link>
          )}
        </div>

        {filteredStores.length === 0 ? (
          <Card className="mt-8 rounded-2xl shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <StoreIcon className="size-8 text-muted-foreground" />
              <p className="font-medium">No stores match “{query}”</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Try Myer, JB Hi-Fi, Coles, Woolworths, Amazon AU, Kogan, The
                Good Guys or Chemist Warehouse.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setQuery("")}
              >
                Clear search
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {filteredStores.map((store) => (
              <StoreCard key={store.id} store={store} variant="stack" />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

/** One coloured-dot line in the hero stack teaser. */
function TeaserLine({
  dotClass,
  label,
  value,
}: {
  dotClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="flex items-center gap-2.5 text-muted-foreground">
        <span className={cn("size-2.5 rounded-full", dotClass)} />
        {label}
      </dt>
      <dd className="font-medium tabular-nums text-foreground">
        − {formatAUD(value)}
      </dd>
    </div>
  );
}

export default HomeSearchSections;
