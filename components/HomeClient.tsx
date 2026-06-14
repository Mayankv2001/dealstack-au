"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgePercent,
  BookOpen,
  CreditCard,
  Gift,
  Search,
  Star,
  Store as StoreIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import DealStackCalculator from "@/components/DealStackCalculator";
import Logo from "@/components/Logo";
import StoreCard from "@/components/StoreCard";
import type { Store } from "@/lib/data";

/**
 * Homepage client island. All interactive UI (search box, store filtering) lives
 * here; the `stores` list is loaded on the server (app/page.tsx) via the repo
 * layer and passed in as a prop, so the homepage shows live Supabase data while
 * still rendering from the static fallback when the DB is unavailable. The UI is
 * unchanged from the original homepage.
 */

const stackingSteps = [
  {
    icon: BadgePercent,
    title: "Apply a discount code",
    description: "Cut the checkout price first with the best public promo code.",
  },
  {
    icon: Gift,
    title: "Pay with discounted gift cards",
    description:
      "Buy them below face value via RACV, NRMA or Suncorp Benefits, then pay with them.",
  },
  {
    icon: CreditCard,
    title: "Earn cashback on top",
    description:
      "Click through ShopBack or TopCashback so a slice of checkout comes back.",
  },
  {
    icon: Star,
    title: "Collect points as you go",
    description:
      "Scan Flybuys or Everyday Rewards — points stack on everything above.",
  },
];

export default function HomeClient({ stores }: { stores: Store[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filteredStores = stores.filter((store) =>
    `${store.name} ${store.category}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground sm:flex">
            <a href="#stores" className="transition-colors hover:text-foreground">
              Stores
            </a>
            <Link
              href="/deals"
              className="transition-colors hover:text-foreground"
            >
              Weekly Deals
            </Link>
            <a
              href="#how-it-works"
              className="transition-colors hover:text-foreground"
            >
              How it works
            </a>
            <a
              href="#calculator"
              className="transition-colors hover:text-foreground"
            >
              Calculator
            </a>
            <Link
              href="/resources"
              className="transition-colors hover:text-foreground"
            >
              Resources
            </Link>
          </nav>
          <Button
            asChild
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <a href="#calculator">Try the calculator</a>
          </Button>
        </div>
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
            className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Search once.{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  Stack every saving.
                </span>
              </h1>
              <p className="mt-3 text-base font-medium sm:text-lg">
                Find the discount, cashback, gift card and points stack before
                you buy.
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Codes, ShopBack &amp; TopCashback cashback, discounted gift
                cards and Flybuys-style points — combined into one effective
                price.
              </p>
              <form onSubmit={handleSearch} className="relative mt-5">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search a store, e.g. JB Hi-Fi"
                  className="h-11 bg-background pl-9 pr-24 shadow-sm"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search stores"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Search
                </Button>
              </form>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  asChild
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  <Link href="/search?q=myer">
                    Search Myer stack
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline" className="bg-background">
                  <Link href="/resources">
                    <BookOpen className="size-3.5" />
                    Browse points resources
                  </Link>
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="gap-1 bg-background">
                  <BadgePercent className="size-3 text-primary" />
                  Codes
                </Badge>
                <span>+</span>
                <Badge variant="outline" className="gap-1 bg-background">
                  <Gift className="size-3 text-violet-500" />
                  Gift cards
                </Badge>
                <span>+</span>
                <Badge variant="outline" className="gap-1 bg-background">
                  <CreditCard className="size-3 text-emerald-500" />
                  Cashback
                </Badge>
                <span>+</span>
                <Badge variant="outline" className="gap-1 bg-background">
                  <Star className="size-3 text-amber-500" />
                  Points
                </Badge>
              </div>
            </div>
          </div>
        </section>

        {/* Popular stores */}
        <section id="stores" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
                Popular stores
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Example stacks for Australia&apos;s favourite retailers.
              </p>
            </div>
          </div>
          {filteredStores.length === 0 ? (
            <Card className="shadow-sm">
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <StoreIcon className="size-8 text-muted-foreground" />
                <p className="font-medium">No stores match “{query}”</p>
                <p className="text-sm text-muted-foreground">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filteredStores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
        </section>

        {/* How stacking works */}
        <section id="how-it-works" className="border-y bg-background">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              How deal stacking works
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">
              Each saving applies to a different part of your purchase, so they
              multiply instead of clashing. Order matters.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {stackingSteps.map((step, i) => (
                <div
                  key={step.title}
                  className="rounded-xl border bg-emerald-500/[0.03] p-4 shadow-sm transition-colors hover:bg-emerald-500/[0.06]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <step.icon className="size-4" />
                    </span>
                    <span className="font-mono text-xs font-bold text-muted-foreground">
                      0{i + 1}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold">{step.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Calculator */}
        <section
          id="calculator"
          className="mx-auto flex max-w-6xl flex-col items-center px-4 py-8 sm:px-6"
        >
          <div className="mb-4 text-center">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
              See your stack in dollars
            </h2>
            <p className="mx-auto mt-0.5 max-w-xl text-sm text-muted-foreground">
              Pick a store or enter your own rates to see the real
              out-of-pocket price after every layer.
            </p>
          </div>
          <DealStackCalculator />
        </section>
      </main>

      {/* Footer / disclaimer */}
      <footer className="border-t bg-background">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
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
      </footer>
    </div>
  );
}
