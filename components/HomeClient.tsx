"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  Gift,
  Megaphone,
  Menu,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DealStackCalculator from "@/components/DealStackCalculator";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import StoreCard, { SAMPLE_SPEND } from "@/components/StoreCard";
import StoreLogo from "@/components/StoreLogo";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Homepage client island. All interactive UI (search box, live store filtering,
 * mobile nav) lives here; the `stores` list is loaded on the server
 * (app/page.tsx) via the repo layer and passed in as a prop, so the homepage
 * shows live Supabase data while still rendering from the static fallback when
 * the DB is unavailable. No data fetching or business logic lives here — every
 * dollar figure is derived from the passed-in stores via calculateStack().
 */

const navLinks = [
  { label: "Stores", href: "#stores", external: false },
  { label: "Weekly Deals", href: "/deals", external: true },
  { label: "How it works", href: "#how-it-works", external: false },
  { label: "Calculator", href: "#calculator", external: false },
  { label: "Resources", href: "/resources", external: true },
];

const savingsLayers = [
  {
    icon: CreditCard,
    title: "Cashback",
    description:
      "Click through ShopBack or TopCashback and a slice of your checkout comes back to you — on top of any discount.",
    accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    icon: Gift,
    title: "Discounted gift cards",
    description:
      "Buy gift cards below face value via RACV, NRMA, RACQ or Suncorp Benefits, then pay with them at checkout.",
    accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    icon: Star,
    title: "Points & rewards",
    description:
      "Scan Flybuys, Everyday Rewards or a store program so points pile up on everything you were already buying.",
    accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    href: "/resources",
    linkLabel: "Points resources",
  },
  {
    icon: Megaphone,
    title: "Community deal signals",
    description:
      "We surface manually curated weekly deals and community signals worth stacking — never auto-published.",
    accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    href: "/deals",
    linkLabel: "Browse weekly deals",
  },
];

const trustPoints = [
  {
    icon: ShieldCheck,
    title: "Manually curated",
    description:
      "Every store and example stack is reviewed by a human. Nothing is auto-published or scraped on demand.",
  },
  {
    icon: RefreshCw,
    title: "Cached & refreshed",
    description:
      "Offers are cached and refreshed periodically for speed — not pulled live from retailers each visit.",
  },
  {
    icon: BadgeCheck,
    title: "Verify before buying",
    description:
      "Rates and codes change fast. Always confirm the current offer with the retailer and provider first.",
  },
];

export default function HomeClient({ stores }: { stores: Store[] }) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  // Feature the store with the biggest dollar saving on a sample $500 spend.
  // Used for the hero teaser and the worked $500 example — derived, not stored.
  const featured = useMemo(() => {
    let best: { store: Store; stack: ReturnType<typeof calculateStack> } | null =
      null;
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
    <div className="min-h-screen bg-emerald-500/[0.04]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
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
            <Button
              asChild
              size="sm"
              className="hidden bg-emerald-600 text-white hover:bg-emerald-700 sm:inline-flex"
            >
              <a href="#calculator">Try the calculator</a>
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
              <Button
                asChild
                size="sm"
                className="mt-1 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <a href="#calculator" onClick={() => setMenuOpen(false)}>
                  Try the calculator
                </a>
              </Button>
            </nav>
          </div>
        )}
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-emerald-500/15 via-emerald-500/[0.04] to-transparent"
          />
          <div
            aria-hidden
            className="absolute -top-32 left-1/2 size-[28rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12">
            <div className="max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <Sparkles className="size-3.5" />
                Codes + cashback + gift cards + points
              </span>
              <h1 className="mt-4 font-serif text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Stack every saving{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  before you shop
                </span>
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                Find the discount code, cashback, discounted gift cards and
                points for your favourite Australian stores — combined into one
                effective price.
              </p>

              <div className="mt-6 max-w-xl">
                <SearchBar
                  size="lg"
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Search a store, e.g. JB Hi-Fi"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  asChild
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <a href="#stores">
                    Browse popular stores
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button asChild variant="outline" className="bg-background">
                  <a href="#example">See a $500 stack</a>
                </Button>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  Manually curated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  No scraping
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <BadgeCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  Verify before buying
                </span>
              </div>
            </div>

            {/* Live $500 stack teaser */}
            {featured && (
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-3 -z-10 rounded-[28px] bg-emerald-500/10 blur-2xl"
                />
                <Card className="rounded-3xl border-emerald-500/20 shadow-xl shadow-emerald-900/[0.08]">
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Example stack · {formatAUD(SAMPLE_SPEND)} cart
                      </span>
                      <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                        Save {featured.stack.totalSavingPercent}%
                      </Badge>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <StoreLogo store={featured.store} size="md" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-tight">
                          {featured.store.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {featured.store.category}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 flex items-end justify-between rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-transparent px-4 py-3">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Effective price
                        </p>
                        <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                          {formatAUD(featured.stack.finalEffectivePrice)}
                        </p>
                      </div>
                      <p className="pb-1 text-sm font-medium text-muted-foreground line-through">
                        {formatAUD(SAMPLE_SPEND)}
                      </p>
                    </div>

                    <dl className="mt-4 space-y-1.5 text-sm">
                      <StackLine
                        label={`Discount code${
                          featured.store.discountPercent > 0
                            ? ` (${featured.store.discountPercent}%)`
                            : ""
                        }`}
                        value={featured.stack.discountSaving}
                      />
                      <StackLine
                        label="Discounted gift cards"
                        value={featured.stack.giftCardSaving}
                      />
                      <StackLine
                        label="Cashback"
                        value={featured.stack.estimatedCashback}
                      />
                    </dl>

                    <Button
                      asChild
                      className="mt-5 w-full bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Link href={`/stores/${featured.store.id}`}>
                        View this stack
                        <ArrowRight className="size-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </section>

        {/* Savings layers */}
        <section id="how-it-works" className="border-b bg-background">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                Four savings layers, one checkout
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Each layer applies to a different part of your purchase, so they
                multiply instead of clashing. Combine them and the effective
                price drops well below the sticker.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {savingsLayers.map((layer) => (
                <div
                  key={layer.title}
                  className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-1 hover:shadow-md"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      layer.accent
                    )}
                  >
                    <layer.icon className="size-5" />
                  </span>
                  <p className="mt-4 font-semibold">{layer.title}</p>
                  <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {layer.description}
                  </p>
                  {layer.href && (
                    <Link
                      href={layer.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {layer.linkLabel}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Popular stores */}
        <section id="stores" className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                Popular stores
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Example stacks for Australia’s favourite retailers, on a{" "}
                {formatAUD(SAMPLE_SPEND)} spend.
              </p>
            </div>
            {query.trim() && (
              <Button
                variant="outline"
                size="sm"
                className="bg-background"
                onClick={() => setQuery("")}
              >
                Clear search
              </Button>
            )}
          </div>
          {filteredStores.length === 0 ? (
            <Card className="rounded-2xl shadow-sm">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filteredStores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
        </section>

        {/* Worked $500 deal-stack example */}
        {featured && (
          <section id="example" className="border-y bg-background">
            <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Receipt className="size-3.5" />
                  Worked example
                </span>
                <h2 className="mt-4 font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                  A {formatAUD(SAMPLE_SPEND)} cart at {featured.store.name}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                  Watch the sticker price melt as each layer applies in order — a
                  discount code first, then gift cards bought below face value,
                  then cashback on what you actually spend.
                </p>

                {/* Waterfall bar */}
                <div className="mt-6">
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    <Segment
                      amount={featured.stack.discountSaving}
                      className="bg-primary"
                    />
                    <Segment
                      amount={featured.stack.giftCardSaving}
                      className="bg-violet-500"
                    />
                    <Segment
                      amount={featured.stack.estimatedCashback}
                      className="bg-emerald-500"
                    />
                    <Segment
                      amount={featured.stack.finalEffectivePrice}
                      className="bg-foreground/15"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <Legend className="bg-primary" label="Discount code" />
                    <Legend className="bg-violet-500" label="Gift cards" />
                    <Legend className="bg-emerald-500" label="Cashback" />
                    <Legend className="bg-foreground/15" label="You pay" />
                  </div>
                </div>
              </div>

              {/* Receipt */}
              <Card className="rounded-3xl shadow-xl shadow-emerald-900/[0.06]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <StoreLogo store={featured.store} size="md" />
                      <div>
                        <p className="font-semibold leading-tight">
                          {featured.store.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {featured.store.category}
                        </p>
                      </div>
                    </div>
                    {featured.store.discountPercent > 0 && (
                      <code className="rounded bg-muted px-2 py-1 font-mono text-xs font-semibold">
                        {featured.store.discountCode}
                      </code>
                    )}
                  </div>

                  <dl className="mt-5 space-y-2.5 border-t pt-4 text-sm">
                    <ReceiptRow
                      label="Cart total"
                      value={formatAUD(featured.stack.originalPrice)}
                    />
                    <ReceiptRow
                      label={`Discount code${
                        featured.store.discountPercent > 0
                          ? ` · ${featured.store.discountPercent}%`
                          : ""
                      }`}
                      value={`− ${formatAUD(featured.stack.discountSaving)}`}
                      muted
                    />
                    <ReceiptRow
                      label="Checkout price"
                      value={formatAUD(featured.stack.checkoutPrice)}
                    />
                    <ReceiptRow
                      label="Discounted gift cards"
                      value={`− ${formatAUD(featured.stack.giftCardSaving)}`}
                      muted
                    />
                    <ReceiptRow
                      label="Cashback"
                      value={`− ${formatAUD(featured.stack.estimatedCashback)}`}
                      muted
                    />
                  </dl>

                  <div className="mt-4 flex items-end justify-between border-t border-dashed pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Effective price
                      </p>
                      <p className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                        {formatAUD(featured.stack.finalEffectivePrice)}
                      </p>
                    </div>
                    <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">
                      You save {formatAUD(featured.stack.totalSaving)}
                    </Badge>
                  </div>

                  {featured.store.pointsProgram !== "—" && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Star className="size-3.5 text-amber-500" />
                      Plus {featured.store.pointsProgram} points on top (
                      {featured.store.pointsRate})
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
          className="mx-auto flex max-w-6xl flex-col items-center px-4 py-12 sm:px-6 sm:py-16"
        >
          <div className="mb-6 text-center">
            <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
              See your own stack in dollars
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
              Pick a store or enter your own rates to see the real out-of-pocket
              price after every layer.
            </p>
          </div>
          <DealStackCalculator />
        </section>

        {/* Trust & safety */}
        <section className="border-y bg-background">
          <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <h2 className="font-serif text-2xl font-bold tracking-tight sm:text-3xl">
                Built to be trusted, not just clicked
              </h2>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                DealStack AU is a reference tool, not a live price feed. Here is
                how we keep it honest.
              </p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <div
                  key={point.title}
                  className="rounded-2xl border bg-card p-5 shadow-sm"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <point.icon className="size-5" />
                  </span>
                  <p className="mt-4 font-semibold">{point.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {point.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 to-[#0a1410] px-6 py-12 text-center shadow-xl sm:px-12 sm:py-16">
            <div
              aria-hidden
              className="absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl"
            />
            <div className="relative mx-auto max-w-xl">
              <h2 className="font-serif text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Start stacking smarter
              </h2>
              <p className="mt-3 text-emerald-100/80">
                Search a store, stack the savings and see the effective price
                before you ever hit checkout.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-emerald-900 hover:bg-emerald-50"
                >
                  <a href="#stores">
                    Browse stores
                    <ArrowRight className="size-4" />
                  </a>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-white/0 text-white hover:bg-white/10 hover:text-white"
                >
                  <a href="#calculator">Try the calculator</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xs">
              <Logo />
              <p className="mt-3 text-sm text-muted-foreground">
                Stack codes, cashback, discounted gift cards and points into one
                effective price.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
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
                Weekly Deals
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
            </nav>
          </div>

          <div className="mt-8 border-t pt-6">
            <p className="text-xs leading-relaxed text-muted-foreground">
              <strong>Disclaimer:</strong> All discount codes, cashback rates,
              gift card discounts, points rates and expiry dates shown on
              DealStack AU are illustrative examples only and change frequently.
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

/** One muted "− $x" line in the hero teaser stack summary. */
function StackLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">− {formatAUD(value)}</dd>
    </div>
  );
}

/** A row in the worked-example receipt. */
function ReceiptRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          muted ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** A proportional segment of the waterfall bar (hidden when zero). */
function Segment({ amount, className }: { amount: number; className: string }) {
  if (amount <= 0) return null;
  return (
    <span
      className={className}
      style={{ width: `${(amount / SAMPLE_SPEND) * 100}%` }}
    />
  );
}

/** Colour swatch + label under the waterfall bar. */
function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}
