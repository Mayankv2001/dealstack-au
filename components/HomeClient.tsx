"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  CreditCard,
  Lock,
  Menu,
  Percent,
  ShieldCheck,
  Sparkles,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DealStackCalculator from "@/components/DealStackCalculator";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import StoreCard, { SAMPLE_SPEND } from "@/components/StoreCard";
import TopDealsSection from "@/components/TopDealsSection";
import { calculateStack, formatAUD, type StackResult } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { TopDeal } from "@/lib/repos/topDealsRanking";
import { cn } from "@/lib/utils";

/**
 * Homepage client island. All interactive UI (search box, live store filtering,
 * mobile nav, the worked-example view toggle) lives here; the `stores` list is
 * loaded on the server (app/page.tsx) via the repo layer and passed in as a
 * prop, so the homepage shows live Supabase data while still rendering from the
 * static fallback when the DB is unavailable. No data fetching or business
 * logic lives here — every dollar figure is derived from the passed-in stores
 * via calculateStack().
 */

const navLinks = [
  { label: "How it works", href: "#how-it-works", external: false },
  { label: "Stores", href: "#stores", external: false },
  { label: "Deal stacks", href: "/deals", external: true },
  { label: "Card offers", href: "/cards", external: true },
  { label: "Resources", href: "/resources", external: true },
  { label: "Trust & safety", href: "#trust", external: false },
];

const savingsLayers = [
  {
    icon: Percent,
    iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    title: "Cashback",
    description:
      "Earn a percentage back on every eligible purchase, paid out after the store confirms your order.",
    example: "≈ $18 back on a $300 order",
    exampleClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  {
    icon: CreditCard,
    iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    title: "Discounted gift cards",
    description:
      "Buy store gift cards below face value, then pay with them at checkout for an instant upfront discount.",
    example: "Up to 6% off before you shop",
    exampleClass: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
  {
    icon: Sparkles,
    iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-500",
    title: "Points & rewards",
    description:
      "Stack loyalty points and card rewards on the same spend, so nothing is left on the table.",
    example: "+2,400 points on a typical shop",
    exampleClass: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
  },
  {
    icon: BarChart3,
    iconClass: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    title: "Community deal signals",
    description:
      "See which deals the community is finding and verifying right now, ranked by real activity.",
    example: "Live from the community feed",
    exampleClass: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  },
];

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Manually curated & cached",
    description:
      "Every offer is reviewed and recorded by a person — never blindly auto-scraped from a feed.",
  },
  {
    icon: Clock,
    title: "“Last checked” on every offer",
    description:
      "See exactly when a deal was last verified, so you can judge how fresh it is.",
  },
  {
    icon: CheckCircle2,
    title: "Verify before you buy",
    description:
      "Always confirm the rate and terms at the store before checkout. Offers can change.",
  },
  {
    icon: Lock,
    title: "No automatic publishing",
    description:
      "Community feeds are reviewed first — nothing goes public from a raw feed unchecked.",
  },
];

export default function HomeClient({
  stores,
  topDeals,
}: {
  stores: Store[];
  topDeals: TopDeal[];
}) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [exampleView, setExampleView] = useState<"waterfall" | "receipt">(
    "waterfall"
  );

  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  // Feature the store with the biggest dollar saving on a sample $500 spend.
  // Used for the hero teaser and the worked $500 example — derived, not stored.
  const featured = useMemo(() => {
    let best: { store: Store; stack: StackResult } | null = null;
    for (const store of stores) {
      const stack = calculateStack({
        originalPrice: SAMPLE_SPEND,
        discountPercent: store.discountPercent,
        cashbackPercent: store.cashbackPercent,
        giftCardDiscountPercent: store.giftCardDiscountPercent,
      });
      if (!best || stack.totalSaving > best.stack.totalSaving) {
        best = { store, stack };
      }
    }
    return best;
  }, [stores]);

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            {navLinks.map((link) =>
              link.external ? (
                <Link
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  className="transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              )
            )}
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/admin/login">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="hidden bg-emerald-600 text-white hover:bg-emerald-700 sm:inline-flex"
            >
              <a href="#stores">Get started</a>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              className="md:hidden"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="border-t bg-background/95 backdrop-blur md:hidden">
            <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 text-sm font-medium sm:px-6">
              {navLinks.map((link) =>
                link.external ? (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                ) : (
                  <a
                    key={link.label}
                    href={link.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {link.label}
                  </a>
                )
              )}
              <div className="mt-2 flex flex-col gap-2 border-t pt-3">
                <Button asChild variant="outline" size="sm">
                  <Link href="/admin/login" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <a href="#stores" onClick={() => setMenuOpen(false)}>
                    Get started
                  </a>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main>
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

        {/* Savings layers */}
        <section id="how-it-works" className="scroll-mt-16 border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              The savings layers
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              Four ways to save, stacked on one purchase
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
              Each layer works on its own. Stacked together on the same cart,
              they compound into a meaningfully lower effective price.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {savingsLayers.map((layer) => (
                <div
                  key={layer.title}
                  className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-xl",
                      layer.iconClass
                    )}
                  >
                    <layer.icon className="size-5" />
                  </span>
                  <p className="mt-5 font-semibold">{layer.title}</p>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {layer.description}
                  </p>
                  <span
                    className={cn(
                      "mt-5 inline-flex w-fit rounded-full px-3 py-1 text-xs font-medium",
                      layer.exampleClass
                    )}
                  >
                    {layer.example}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

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

        {/* Today's top OzBargain signals (staged, review-gated, read-only) */}
        <TopDealsSection deals={topDeals} />

        {/* Worked $500 deal-stack example */}
        {featured && (
          <section id="example" className="scroll-mt-16 border-y bg-muted/30">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    A worked example
                  </p>
                  <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">
                    A {formatAUD(SAMPLE_SPEND)} cart, stacked down to{" "}
                    {formatAUD(featured.stack.finalEffectivePrice)}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
                    Same cart, every layer applied in order. Here’s exactly how
                    the effective cost comes down.
                  </p>
                </div>
                <div className="inline-flex rounded-full bg-muted p-1 text-sm font-medium">
                  <button
                    type="button"
                    onClick={() => setExampleView("waterfall")}
                    className={cn(
                      "rounded-full px-4 py-1.5 transition-colors",
                      exampleView === "waterfall"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Waterfall
                  </button>
                  <button
                    type="button"
                    onClick={() => setExampleView("receipt")}
                    className={cn(
                      "rounded-full px-4 py-1.5 transition-colors",
                      exampleView === "receipt"
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Receipt
                  </button>
                </div>
              </div>

              <Card className="mt-8 rounded-3xl shadow-xl shadow-emerald-900/[0.06]">
                <CardContent className="p-6 sm:p-8">
                  {exampleView === "waterfall" ? (
                    <WaterfallView store={featured.store} stack={featured.stack} />
                  ) : (
                    <ReceiptView store={featured.store} stack={featured.stack} />
                  )}

                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-dashed pt-6">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Effective cost
                      </p>
                      <p className="font-serif text-4xl font-bold tracking-tight">
                        {formatAUD(featured.stack.finalEffectivePrice)}{" "}
                        <span className="text-lg font-medium text-muted-foreground line-through">
                          {formatAUD(SAMPLE_SPEND)}
                        </span>
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-500/10 px-5 py-3 text-right">
                      <p className="font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                        {formatAUD(featured.stack.totalSaving)}
                        <span className="ml-1.5 text-sm font-medium">saved</span>
                      </p>
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        {featured.stack.totalSavingPercent}% off
                      </p>
                    </div>
                  </div>

                  {featured.store.pointsProgram !== "—" && (
                    <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="size-3.5 text-amber-500" />
                      Plus {featured.store.pointsProgram} points on top (
                      {featured.store.pointsRate}) — bonus value not counted
                      above.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        )}

        {/* Calculator */}
        <section
          id="calculator"
          className="mx-auto flex max-w-6xl scroll-mt-16 flex-col items-center px-4 py-16 sm:px-6 sm:py-20"
        >
          <div className="mb-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Try your own numbers
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              See your own stack in dollars
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Pick a store or enter your own rates to see the real out-of-pocket
              price after every layer.
            </p>
          </div>
          <DealStackCalculator stores={stores} />
        </section>

        {/* Trust & safety */}
        <section id="trust" className="scroll-mt-16 border-y bg-muted/30">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                Trust &amp; safety
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-[1.1] tracking-tight sm:text-4xl">
                Curated by people, not scraped by bots
              </h2>
              <p className="mt-4 max-w-md text-sm text-muted-foreground sm:text-base">
                Deals move fast and terms change. We keep things honest: every
                offer is reviewed and cached by a person, timestamped, and
                clearly flagged for you to verify before you buy.
              </p>
              <a
                href="#disclaimer"
                className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
              >
                Read our sourcing policy
                <ArrowRight className="size-4" />
              </a>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {trustPoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-2xl border bg-card p-6 shadow-sm"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <point.icon className="size-5" />
                  </span>
                  <p className="mt-4 font-semibold">{point.title}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-emerald-950 to-[#0a1410] px-6 py-14 text-center shadow-xl sm:px-12 sm:py-20">
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl"
            />
            <div className="relative mx-auto max-w-xl">
              <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-emerald-100">
                No fees · No catch
              </span>
              <h2 className="mt-5 font-serif text-4xl font-bold tracking-tight text-white sm:text-5xl">
                Start stacking smarter
              </h2>
              <p className="mt-4 text-emerald-100/80">
                Search any store and see your full stack — cashback, gift cards,
                points and signals — in seconds.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-emerald-900 hover:bg-emerald-50"
                >
                  <a href="#stores">
                    Get started
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/0 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#how-it-works">How it works</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-3 text-sm text-muted-foreground">
                Stack cashback, discounted gift cards, points and community
                signals into one effective price.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-10 gap-y-2 text-sm">
              <a
                href="#stores"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Stores
              </a>
              <Link
                href="/deals"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Deal stacks
              </Link>
              <Link
                href="/cards"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Card offers
              </Link>
              <a
                href="#calculator"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Calculator
              </a>
              <Link
                href="/resources"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Resources
              </Link>
              <a
                href="#trust"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                Trust &amp; safety
              </a>
            </nav>
          </div>

          <div id="disclaimer" className="mt-10 scroll-mt-16 border-t pt-6">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong>Disclaimer:</strong> All discount codes, cashback rates,
              gift card discounts, points rates and expiry dates on DealStack AU
              are manually curated and served from a cache — offers change or
              expire without notice, so what you see here may be out of date.
              Always confirm current offers directly with the retailer and
              providers such as ShopBack, TopCashback, Flybuys and Everyday
              Rewards before purchasing. DealStack AU is not affiliated with any
              retailer or rewards program listed.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              © {new Date().getFullYear()} DealStack AU
            </p>
          </div>
        </div>
      </footer>
    </div>
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

/** Ordered savings steps shared by the waterfall and receipt views. */
function buildSteps(store: Store, stack: StackResult) {
  const steps: {
    key: string;
    label: string;
    sub: string;
    amount: number | null;
    running: number;
    barClass: string;
    amountClass: string;
  }[] = [
    {
      key: "cart",
      label: "Cart total",
      sub: "what you’d normally pay",
      amount: null,
      running: stack.originalPrice,
      barClass: "bg-muted text-foreground",
      amountClass: "text-foreground",
    },
  ];
  let running = stack.originalPrice;
  if (stack.discountSaving > 0) {
    running -= stack.discountSaving;
    steps.push({
      key: "discount",
      label: "Discount code",
      sub: `${store.discountPercent}% off at checkout`,
      amount: stack.discountSaving,
      running,
      barClass: "bg-primary text-primary-foreground",
      amountClass: "text-primary",
    });
  }
  if (stack.giftCardSaving > 0) {
    running -= stack.giftCardSaving;
    steps.push({
      key: "giftcard",
      label: "Discounted gift card",
      sub: `bought at ${store.giftCardDiscountPercent}% off face value`,
      amount: stack.giftCardSaving,
      running,
      barClass: "bg-sky-700 text-white",
      amountClass: "text-sky-700 dark:text-sky-400",
    });
  }
  if (stack.estimatedCashback > 0) {
    running -= stack.estimatedCashback;
    steps.push({
      key: "cashback",
      label: "Cashback",
      sub: `${store.cashbackPercent}% confirmed after purchase`,
      amount: stack.estimatedCashback,
      running,
      barClass: "bg-emerald-600 text-white",
      amountClass: "text-emerald-700 dark:text-emerald-400",
    });
  }
  return steps;
}

/** Per-layer running-total waterfall bars. */
function WaterfallView({ store, stack }: { store: Store; stack: StackResult }) {
  const steps = buildSteps(store, stack);
  return (
    <div className="space-y-5">
      {steps.map((step) => (
        <div key={step.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-semibold">{step.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {step.sub}
              </span>
            </span>
            <span className={cn("shrink-0 font-medium tabular-nums", step.amountClass)}>
              {step.amount === null
                ? formatAUD(step.running)
                : `− ${formatAUD(step.amount)}`}
            </span>
          </div>
          <div className="mt-2 h-9 overflow-hidden rounded-lg bg-muted/50">
            <div
              className={cn(
                "flex h-full items-center justify-end rounded-lg px-3",
                step.barClass
              )}
              style={{ width: `${(step.running / stack.originalPrice) * 100}%` }}
            >
              <span className="text-xs font-semibold tabular-nums">
                {formatAUD(step.running)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Itemised receipt of the same stack. */
function ReceiptView({ store, stack }: { store: Store; stack: StackResult }) {
  return (
    <dl className="space-y-3 text-sm">
      <ReceiptRow label="Cart total" value={formatAUD(stack.originalPrice)} />
      {stack.discountSaving > 0 && (
        <ReceiptRow
          label={`Discount code · ${store.discountPercent}%`}
          value={`− ${formatAUD(stack.discountSaving)}`}
          credit
        />
      )}
      <ReceiptRow
        label="Checkout price"
        value={formatAUD(stack.checkoutPrice)}
      />
      {stack.giftCardSaving > 0 && (
        <ReceiptRow
          label={`Discounted gift card · ${store.giftCardDiscountPercent}%`}
          value={`− ${formatAUD(stack.giftCardSaving)}`}
          credit
        />
      )}
      {stack.estimatedCashback > 0 && (
        <ReceiptRow
          label={`Cashback · ${store.cashbackPercent}%`}
          value={`− ${formatAUD(stack.estimatedCashback)}`}
          credit
        />
      )}
    </dl>
  );
}

function ReceiptRow({
  label,
  value,
  credit,
}: {
  label: string;
  value: string;
  credit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-dashed pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          credit ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
