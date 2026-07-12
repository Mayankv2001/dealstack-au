"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Gift, Info, SearchX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GiftCardOfferCard } from "@/components/GiftCardOfferCard";
import Logo from "@/components/Logo";
import SiteFooter from "@/components/SiteFooter";
import type { GiftCardOffer } from "@/lib/offers/types";
import {
  GC_SORT_LABEL,
  GIFT_CARD_SORTS,
  GIFT_CARD_TABS,
  TAB_LABEL,
  giftCardHref,
  parseGiftCardParams,
  queryGiftCardOffers,
  type GiftCardQueryParams,
} from "@/lib/giftcards/publicQuery";
import { cn } from "@/lib/utils";

/**
 * Interactive client for the public /gift-cards page. Holds URL-derived filter
 * state only — app/gift-cards/page.tsx loads the APPROVED offers (RLS
 * is_published) and passes them in. All filtering/sorting is the pure,
 * unit-tested lib/giftcards/publicQuery so the UI and tests can't diverge.
 */

export function GiftCardsClient({ offers }: { offers: GiftCardOffer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => {
    const raw: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    return parseGiftCardParams(raw);
  }, [searchParams]);

  const visible = useMemo(
    () => queryGiftCardOffers(offers, params),
    [offers, params]
  );

  function update(overrides: Partial<GiftCardQueryParams>): void {
    const href = giftCardHref(params, overrides);
    router.replace(href, { scroll: false });
  }

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">Deals</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/stores">Stores</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/cards">Cards</Link>
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              Gift cards
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Hero */}
        <div className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-background p-4 shadow-sm sm:p-5">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="gap-1 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              <Gift className="size-3" />
              Gift card offers
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Gift card{" "}
              <span className="text-emerald-600 dark:text-emerald-400">deals</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Discounted, bonus-value and points gift-card promotions — a core
              stacking layer for Australian shoppers. Every offer here is{" "}
              <span className="font-medium text-foreground">
                reviewed by a person before it is published
              </span>
              , with the source and last-checked date on each card.
            </p>
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <span className="font-medium">How we value offers:</span> discounts
              show as-is. Bonus value and points show an <em>effective saving</em>{" "}
              against the net cost — points use our published valuation (e.g.
              Everyday Rewards and Flybuys at 0.5c/point). The cash you pay and
              the reward value are always shown separately, never merged.
            </span>
          </p>
        </div>

        {/* Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {GIFT_CARD_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => update({ tab })}
              aria-pressed={params.tab === tab}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                params.tab === tab
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
              )}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </div>

        {/* Search + sort */}
        <div className="mt-4 flex flex-col gap-2 border-y py-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            defaultValue={params.q}
            placeholder="Search brand, retailer or programme…"
            onChange={(e) => update({ q: e.target.value })}
            className="h-9 w-full rounded-lg border bg-background px-3 text-sm sm:max-w-xs"
            aria-label="Search gift card offers"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select
              value={params.sort}
              onChange={(e) => update({ sort: e.target.value as GiftCardQueryParams["sort"] })}
              className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
            >
              {GIFT_CARD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {GC_SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Grid / empty state */}
        {visible.length === 0 ? (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">
              {offers.length === 0
                ? "No gift card offers published yet"
                : "No gift card offers match these filters"}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {offers.length === 0
                ? "Unverified, expired or overdue offers are withheld until an admin reviews them. Check back soon."
                : "Try another tab or clear the search — new offers are added after manual review."}
            </p>
            {offers.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                Clear filters
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/deals">Browse deals</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-muted-foreground">
              {visible.length} offer{visible.length === 1 ? "" : "s"}
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((offer) => (
                <GiftCardOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </>
        )}

        {/* Footer disclaimer */}
        <section className="mt-8">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>Disclaimer:</strong> general information only, not
                financial advice. Gift-card discounts, bonus rates, points
                valuations, denominations and eligibility change without notice
                and vary by person — always confirm current terms with the
                seller and check whether a card is accepted before you buy.
                Points values are estimates, not guaranteed cash.
              </span>
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

export default GiftCardsClient;
