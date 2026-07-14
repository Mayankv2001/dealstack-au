"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Gift,
  Sparkles,
  Store as StoreIcon,
} from "lucide-react";
import SearchBar from "@/components/SearchBar";
import StoreCard from "@/components/StoreCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";
import { summariseStackOutcome } from "@/lib/stack/outcome";
import { buildStackSteps } from "@/lib/stack/present";

const QUICK_STARTS = [
  {
    title: "Save at a store",
    text: "See every compatible saving layer",
    href: "/stores",
    icon: StoreIcon,
    tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  {
    title: "Find discounted gift cards",
    text: "Search offers, brands and sellers",
    href: "/gift-cards",
    icon: Gift,
    tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  },
  {
    title: "Earn more points",
    text: "Qantas, Velocity, Flybuys and Everyday Rewards",
    href: "/rewards",
    icon: Sparkles,
    tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  {
    title: "Expiring opportunities",
    text: "Check reviewed offers ending soon",
    href: "/deals?view=expiring",
    icon: Clock3,
    tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
] as const;

export function HomeSearchSections({
  stores,
  recommendations,
  heroStack,
  nowIso,
  todayFeed,
}: {
  stores: Store[];
  recommendations: StackRecommendation[];
  heroStack: StackRecommendation | null;
  nowIso: string;
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
        <div className="page-container py-10 sm:py-14 lg:py-16">
          <div className="max-w-4xl">
            <p className="eyebrow">Australia’s purchase-planning engine</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
              Plan the cheapest way to buy
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Enter a store and your expected spend. DealStack checks available
              codes, gift cards, cashback and points, then shows the safest
              order to use them.
            </p>

            <div
              id="store-search"
              className="mt-6 max-w-3xl scroll-mt-24 rounded-xl border border-foreground/10 bg-background p-2.5 shadow-sm"
            >
              <SearchBar
                size="lg"
                layout="split"
                value={query}
                onValueChange={setQuery}
                placeholder="Search a store, e.g. Myer, JB Hi-Fi or Amazon"
                buttonLabel="Build my saving plan"
                showSpend
                defaultSpend={500}
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <Link
                href="/deals"
                className="inline-flex items-center gap-1.5 text-emerald-800 hover:underline dark:text-emerald-300"
              >
                Browse today’s deals{" "}
                <ArrowRight aria-hidden className="size-4" />
              </Link>
              <a
                href="#stores"
                className="text-muted-foreground hover:text-foreground"
              >
                Search by store
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
              {[
                "Human-reviewed",
                "Sources visible",
                "Points kept separate from cash",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check aria-hidden className="size-3.5 text-emerald-700" />{" "}
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        className="page-container py-8 sm:py-10"
        aria-labelledby="featured-plan-heading"
      >
        <p className="eyebrow">Featured purchase plan</p>
        <h2
          id="featured-plan-heading"
          className="mt-2 text-2xl font-black tracking-tight"
        >
          See the answer before the fine print
        </h2>
        {heroStack ? (
          <HeroReceipt recommendation={heroStack} />
        ) : (
          <Card className="mt-5 border-dashed bg-background shadow-none">
            <CardContent className="p-6 text-sm text-muted-foreground">
              No fully verified featured stack is available right now. Search a
              store to review its available saving layers and exclusions.
            </CardContent>
          </Card>
        )}
      </section>

      {todayFeed}

      <section
        className="page-container py-8 sm:py-10"
        aria-labelledby="quick-start-heading"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Choose your path</p>
            <h2
              id="quick-start-heading"
              className="mt-2 text-xl font-black tracking-tight sm:text-2xl"
            >
              What do you want to do?
            </h2>
          </div>
          <Link
            href="/search"
            className="hidden items-center gap-1 text-sm font-bold text-emerald-700 hover:underline sm:inline-flex"
          >
            Open purchase planner <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_STARTS.map(({ title, text, href, icon: Icon, tone }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-h-24 items-start gap-3 rounded-xl border border-foreground/10 bg-card p-4 transition hover:border-emerald-500/40"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}
              >
                <Icon aria-hidden className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {text}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section
        id="stores"
        className="page-container scroll-mt-24 py-10 sm:py-14"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Search by store</p>
            <h2 className="section-title mt-2">
              Start with where you’re shopping
            </h2>
          </div>
          {needle ? (
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          ) : (
            <Link
              href="/stores"
              className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 hover:underline dark:text-emerald-300"
            >
              View all stores <ArrowRight aria-hidden className="size-4" />
            </Link>
          )}
        </div>

        {filteredStores.length === 0 ? (
          <div className="mt-7 rounded-xl border border-dashed bg-card p-8 text-center">
            <StoreIcon
              aria-hidden
              className="mx-auto size-7 text-muted-foreground"
            />
            <p className="mt-2 font-semibold">No stores match “{query}”</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a retailer name such as Myer, JB Hi-Fi or Amazon.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="-mx-4 mt-7 grid snap-x snap-mandatory auto-cols-[minmax(16rem,82vw)] grid-flow-col gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:grid-flow-row sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
            {filteredStores.map((store) => (
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
      </section>
    </>
  );
}

function HeroReceipt({
  recommendation,
}: {
  recommendation: StackRecommendation;
}) {
  const outcome = summariseStackOutcome(recommendation);
  const steps = buildStackSteps(
    recommendation.merchantName,
    recommendation,
  ).filter((step) => !step.chooseOne);
  const alternative = recommendation.components.find(
    (component) => component.optional,
  );

  return (
    <Card className="mt-5 border-0 bg-card py-0 shadow-sm ring-1 ring-foreground/10">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Best plan for a {formatAUD(recommendation.basePrice)} purchase
            </p>
            <h3 className="mt-1 text-xl font-black">
              {recommendation.merchantName}
            </h3>
          </div>
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
            Plan confidence:{" "}
            {recommendation.confidence === "confirmed" ? "High" : "Medium"}
          </span>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <dl className="divide-y rounded-lg border px-3 text-sm tabular-nums">
              <ReceiptLine
                label="Original cart"
                value={formatAUD(outcome.originalCart)}
              />
              <ReceiptLine
                label="Pay at checkout"
                value={formatAUD(outcome.cashPaidForCheckout)}
              />
              {outcome.cashbackLater > 0 ? (
                <ReceiptLine
                  label="Cashback expected later"
                  value={formatAUD(outcome.cashbackLater)}
                  saving
                />
              ) : null}
              {outcome.pointsEarned > 0 ? (
                <ReceiptLine
                  label="Points earned"
                  value={`~${outcome.pointsEarned.toLocaleString("en-AU")}`}
                />
              ) : null}
            </dl>
            <div className="mt-4 flex items-end justify-between gap-3 border-t pt-4">
              <div>
                <p className="text-xs text-muted-foreground">
                  Estimated effective cost
                </p>
                <p className="text-3xl font-black tracking-tight text-emerald-800 dark:text-emerald-300">
                  {formatAUD(outcome.effectiveFinalCost)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">
                  Save {formatAUD(recommendation.totalSaving)}
                </p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {recommendation.effectiveDiscountPercent}% cash value
                </p>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Use this order
            </h4>
            <ol className="mt-3 space-y-3">
              {steps.map((step, index) => (
                <li
                  key={`${step.title}-${index}`}
                  className="flex gap-3 text-sm"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {alternative ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
            <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {alternative.label} is an alternative, not an extra layer.{" "}
            {alternative.note}
          </p>
        ) : null}
        <Link
          href={`/stores/${recommendation.merchantId}`}
          className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300"
        >
          View {recommendation.merchantName}’s full plan{" "}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Example only. Eligibility, exclusions, caps and calculation bases can
          vary; verify each source before checkout.
        </p>
      </CardContent>
    </Card>
  );
}

function ReceiptLine({
  label,
  value,
  saving = false,
}: {
  label: string;
  value: string;
  saving?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          saving
            ? "shrink-0 font-semibold text-emerald-800 dark:text-emerald-300"
            : "shrink-0 font-semibold"
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default HomeSearchSections;
