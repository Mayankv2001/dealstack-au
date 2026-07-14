"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgePercent,
  Check,
  CircleDollarSign,
  Clock3,
  Gift,
  Layers3,
  Search,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import StoreCard from "@/components/StoreCard";
import { Button } from "@/components/ui/button";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";
import { summariseStackOutcome } from "@/lib/stack/outcome";
import { buildStackSteps } from "@/lib/stack/present";

const POPULAR_STARTS = ["Apple", "JB Hi-Fi", "Woolworths", "Myer"] as const;

const QUICK_PATHS = [
  {
    title: "Browse current deals",
    text: "Verified, latest and expiring offers",
    href: "/deals",
    icon: BadgePercent,
  },
  {
    title: "Find the right gift card",
    text: "Offers, sellers and where cards work",
    href: "/gift-cards",
    icon: Gift,
  },
  {
    title: "Compare points offers",
    text: "Qantas, Velocity, Flybuys and Everyday Rewards",
    href: "/rewards",
    icon: Sparkles,
  },
  {
    title: "Check cashback conditions",
    text: "Rates, caps and gift-card conflicts",
    href: "/cashback",
    icon: CircleDollarSign,
  },
] as const;

const PLAN_OUTPUTS = [
  ["Pay now", "Cash price after compatible checkout savings"],
  ["Ways to pay", "Retailer-specific gift cards and alternatives"],
  ["Earn later", "Cashback and points kept separate"],
] as const;

export function HomeSearchSections({
  stores,
  recommendations,
  heroStack,
  nowIso,
  marquee,
  todayFeed,
}: {
  stores: Store[];
  recommendations: StackRecommendation[];
  heroStack: StackRecommendation | null;
  nowIso: string;
  /** The gift-card offer marquee, rendered directly after the hero. */
  marquee?: React.ReactNode;
  todayFeed?: React.ReactNode;
}) {
  const now = new Date(nowIso);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`.toLowerCase().includes(needle),
  );
  const recommendationByStore = new Map(
    recommendations.map((recommendation) => [
      recommendation.merchantId,
      recommendation,
    ]),
  );

  return (
    <>
      <section className="border-b border-foreground/10 bg-card">
        <div className="page-container py-8 sm:py-10 lg:py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.86fr)_minmax(34rem,1.14fr)] lg:items-center lg:gap-14">
            <div>
              <p className="eyebrow">Make one purchase decision</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-5xl lg:text-[3.55rem]">
                Plan the cheapest way to buy
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Search a product or store. We compare the retailer, compatible
                gift cards, codes, cashback and points—then put them in the
                right order.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-bold text-muted-foreground">
                  Try
                </span>
                {POPULAR_STARTS.map((start) => (
                  <Link
                    key={start}
                    href={`/search?q=${encodeURIComponent(start)}&spend=500`}
                    className="rounded-full border bg-background px-3 py-1.5 text-xs font-semibold transition hover:border-emerald-600 hover:text-emerald-800"
                  >
                    {start}
                  </Link>
                ))}
              </div>

              <Link
                href="/deals"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-emerald-800 hover:underline dark:text-emerald-300"
              >
                Prefer to browse? See today’s deals
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>

            <div className="border border-foreground/10 bg-background p-4 shadow-[0_20px_60px_-42px_rgba(6,78,59,0.6)] sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                    Purchase planner
                  </p>
                  <h2 className="mt-1 text-xl font-black tracking-tight">
                    What are you buying?
                  </h2>
                </div>
                <span className="hidden items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
                  <Clock3 aria-hidden className="size-3.5" /> About 30 seconds
                </span>
              </div>

              <SearchBar
                className="mt-5"
                size="lg"
                layout="split"
                value={query}
                onValueChange={setQuery}
                placeholder="Product or store, e.g. Apple or JB Hi-Fi"
                buttonLabel="Build my saving plan"
                showSpend
                defaultSpend={500}
              />

              <dl className="mt-5 divide-y border-y">
                {PLAN_OUTPUTS.map(([term, detail]) => (
                  <div
                    key={term}
                    className="grid gap-1 py-3 sm:grid-cols-[6.5rem_1fr] sm:gap-3"
                  >
                    <dt className="flex items-center gap-2 text-sm font-bold">
                      <Check aria-hidden className="size-4 text-emerald-700" />
                      {term}
                    </dt>
                    <dd className="pl-6 text-xs leading-relaxed text-muted-foreground sm:pl-0">
                      {detail}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Reviewed sources only. Points never reduce the amount shown as
                cash paid.
              </p>
            </div>
          </div>

          <ol className="mt-8 grid border-y sm:grid-cols-3" aria-label="How to build a purchase plan">
            {[
              ["1", "Search", "Enter the product or retailer"],
              ["2", "Compare", "See retailer-specific payment options"],
              ["3", "Buy", "Follow the compatible order"],
            ].map(([number, title, detail], index) => (
              <li
                key={number}
                className={`flex items-center gap-3 py-3 sm:px-5 ${
                  index > 0 ? "border-t sm:border-l sm:border-t-0" : ""
                }`}
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-black text-background">
                  {number}
                </span>
                <span>
                  <span className="block text-sm font-bold">{title}</span>
                  <span className="block text-xs text-muted-foreground">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {marquee}

      {todayFeed}

      <section className="page-container py-10 sm:py-12" aria-labelledby="browse-heading">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
          <div>
            <p className="eyebrow">Go straight to the answer</p>
            <h2 id="browse-heading" className="section-title mt-2">
              Browse by what you need
            </h2>
            <div className="mt-5 divide-y border-y">
              {QUICK_PATHS.map(({ title, text, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center gap-3 py-4"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-800">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {text}
                    </span>
                  </span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-emerald-700"
                  />
                </Link>
              ))}
            </div>
          </div>

          {heroStack ? (
            <FeaturedPlan recommendation={heroStack} />
          ) : (
            <div className="border border-foreground/10 bg-card p-5 sm:p-6">
              <div className="flex items-center gap-2">
                <Layers3 aria-hidden className="size-5 text-emerald-700" />
                <h3 className="font-black">What a purchase plan answers</h3>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[
                  ["Best cash option", "Only compatible savings reduce checkout cost."],
                  ["Gift-card choices", "See cards that work at each matched retailer."],
                  ["Rewards separately", "Points, bonus value and future credit stay visible."],
                  ["Safe order", "Activation, code and payment steps are sequenced."],
                ].map(([title, text]) => (
                  <div key={title} className="border-t pt-3">
                    <p className="text-sm font-bold">{title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {text}
                    </p>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-6 bg-emerald-700 text-white hover:bg-emerald-800">
                <Link href="/search">
                  Start a purchase plan <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section
        id="stores"
        className="scroll-mt-24 border-y border-foreground/10 bg-card"
      >
        <div className="page-container py-10 sm:py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow inline-flex items-center gap-2">
                <StoreIcon aria-hidden className="size-4" /> Store planners
              </p>
              <h2 className="section-title mt-2">Start with a retailer</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Open one store to see promo codes, compatible gift cards,
                cashback and points in the same workspace.
              </p>
            </div>
            {needle ? (
              <Button
                variant="outline"
                size="sm"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                Clear “{query}”
              </Button>
            ) : (
              <Link
                href="/stores"
                className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800 hover:underline"
              >
                View all stores <ArrowRight aria-hidden className="size-4" />
              </Link>
            )}
          </div>

          {filteredStores.length === 0 ? (
            <div className="mt-6 border-y py-8 text-center">
              <Search aria-hidden className="mx-auto size-6 text-muted-foreground" />
              <p className="mt-2 font-bold">No store matches “{query}”</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Submit the planner above to search products, cards and programmes too.
              </p>
            </div>
          ) : (
            <div className="-mx-4 mt-6 grid snap-x snap-mandatory auto-cols-[minmax(16rem,82vw)] grid-flow-col gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
              {filteredStores.slice(0, 8).map((store) => (
                <div key={store.id} className="snap-start">
                  <StoreCard
                    store={store}
                    recommendation={recommendationByStore.get(store.id) ?? null}
                    variant="stack"
                    now={now}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function FeaturedPlan({ recommendation }: { recommendation: StackRecommendation }) {
  const outcome = summariseStackOutcome(recommendation);
  const steps = buildStackSteps(recommendation.merchantName, recommendation)
    .filter((step) => !step.chooseOne)
    .slice(0, 3);

  return (
    <article className="border border-foreground/10 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
            Example answer
          </p>
          <h3 className="mt-1 text-xl font-black">{recommendation.merchantName}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Based on a {formatAUD(recommendation.basePrice)} purchase
          </p>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-[10px] font-bold">
          {recommendation.confidence === "confirmed" ? "High" : "Medium"} confidence
        </span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="text-xs text-muted-foreground">Pay at checkout</p>
          <p className="mt-1 text-3xl font-black tracking-tight">
            {formatAUD(outcome.cashPaidForCheckout)}
          </p>
          <dl className="mt-4 space-y-2 border-t pt-3 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Cashback later</dt>
              <dd className="font-bold">{formatAUD(outcome.cashbackLater)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Points earned</dt>
              <dd className="font-bold">~{outcome.pointsEarned.toLocaleString("en-AU")}</dd>
            </div>
          </dl>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Use this order
          </p>
          <ol className="mt-3 space-y-3">
            {steps.map((step, index) => (
              <li key={`${step.title}-${index}`} className="flex gap-2.5 text-xs">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-black text-background">
                  {index + 1}
                </span>
                <span>
                  <span className="block font-bold">{step.title}</span>
                  <span className="mt-0.5 block leading-relaxed text-muted-foreground">
                    {step.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <Link
        href={`/stores/${recommendation.merchantId}`}
        className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-emerald-800 hover:underline"
      >
        Open this store plan <ArrowRight aria-hidden className="size-4" />
      </Link>
    </article>
  );
}

export default HomeSearchSections;
