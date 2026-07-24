"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Gift,
  Info,
  Search,
  SearchX,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { GiftCardOfferCard } from "@/components/GiftCardOfferCard";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
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
import { pluralise } from "@/lib/text/pluralise";

export function GiftCardsClient({ offers }: { offers: GiftCardOffer[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const params = useMemo(() => {
    const raw: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      raw[key] = value;
    });
    return parseGiftCardParams(raw);
  }, [searchParams]);

  const visible = useMemo(
    () => queryGiftCardOffers(offers, params),
    [offers, params],
  );
  const sellers = useMemo(
    () =>
      Array.from(
        new Set(
          offers
            .map((offer) => offer.purchaseLocation ?? offer.source)
            .filter(Boolean),
        ),
      ).sort(),
    [offers],
  );
  const activeFilters = [
    params.seller,
    params.membership,
    params.activation,
    params.format,
    params.minSave,
    params.confirmedCurrentOnly,
  ].filter(Boolean).length;

  function update(overrides: Partial<GiftCardQueryParams>): void {
    router.replace(giftCardHref(params, overrides), { scroll: false });
  }

  const filterControls = (
    <>
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground sm:flex-row sm:items-center">
        Seller
        <select
          value={params.seller ?? ""}
          onChange={(event) => update({ seller: event.target.value || null })}
          className="h-9 min-w-36 rounded-md border bg-background px-2 text-xs text-foreground"
        >
          <option value="">All sellers</option>
          {sellers.map((seller) => (
            <option key={seller} value={seller}>
              {seller}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground sm:flex-row sm:items-center">
        Format
        <select
          value={params.format ?? ""}
          onChange={(event) =>
            update({
              format: (event.target.value ||
                null) as GiftCardQueryParams["format"],
            })
          }
          className="h-9 min-w-28 rounded-md border bg-background px-2 text-xs text-foreground"
        >
          <option value="">Any format</option>
          <option value="digital">Digital</option>
          <option value="physical">Physical</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground sm:flex-row sm:items-center">
        Min saving
        <select
          value={params.minSave ?? ""}
          onChange={(event) =>
            update({
              minSave: event.target.value ? Number(event.target.value) : null,
            })
          }
          className="h-9 min-w-24 rounded-md border bg-background px-2 text-xs text-foreground"
        >
          <option value="">Any</option>
          <option value="3">3%+</option>
          <option value="5">5%+</option>
          <option value="10">10%+</option>
        </select>
      </label>
      <label className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium">
        <input
          type="checkbox"
          checked={params.membership}
          onChange={(event) => update({ membership: event.target.checked })}
          className="accent-emerald-600"
        />
        Membership
      </label>
      <label className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium">
        <input
          type="checkbox"
          checked={params.activation}
          onChange={(event) => update({ activation: event.target.checked })}
          className="accent-emerald-600"
        />
        Activation
      </label>
      <label className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-2.5 text-xs font-medium">
        <input
          type="checkbox"
          checked={params.confirmedCurrentOnly}
          onChange={(event) =>
            update({ confirmedCurrentOnly: event.target.checked })
          }
          className="accent-emerald-600"
        />
        Confirmed current only
      </label>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="page-container flex-1 py-6 sm:py-10">
        <section className="soft-panel flex flex-col justify-between gap-5 px-5 py-6 sm:flex-row sm:items-end sm:px-7 sm:py-7">
          <div>
            <div className="eyebrow flex items-center gap-2">
              <Gift className="size-4" /> Gift-card savings
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Gift card deals
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Compare reviewed discounts, bonus value and points promotions.
              Open any offer to check eligibility before you buy.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="size-4 text-emerald-700 dark:text-emerald-300" />
            Human-reviewed before publication
          </div>
        </section>

        <GiftCardsSubnav current="/gift-cards" className="mt-4" />

        <Link
          href="/gift-cards/weekly"
          className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-sm transition hover:border-emerald-500/50"
        >
          <span>
            <strong>Weekly Coles and Woolworths offers</strong>
            <span className="ml-2 text-xs text-muted-foreground">
              Compare Flybuys and Everyday Rewards promotions
            </span>
          </span>
          <span aria-hidden className="text-emerald-700">→</span>
        </Link>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={params.q}
              placeholder="Search gift cards, sellers or rewards programmes"
              onChange={(event) => update({ q: event.target.value })}
              className="h-11 w-full rounded-xl border bg-background pl-9 pr-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              aria-label="Search gift card offers"
            />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-xl border bg-background px-3 text-xs text-muted-foreground shadow-sm">
            Sort
            <select
              value={params.sort}
              onChange={(event) =>
                update({
                  sort: event.target.value as GiftCardQueryParams["sort"],
                })
              }
              className="min-w-40 bg-transparent text-sm font-medium text-foreground outline-none"
            >
              {GIFT_CARD_SORTS.map((sort) => (
                <option key={sort} value={sort}>
                  {GC_SORT_LABEL[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <nav
          className="mt-3 flex gap-1.5 overflow-x-auto pb-1"
          aria-label="Gift card categories"
        >
          {GIFT_CARD_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => update({ tab })}
              aria-pressed={params.tab === tab}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                params.tab === tab
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "bg-background text-muted-foreground hover:border-emerald-500/50 hover:text-foreground",
              )}
            >
              {TAB_LABEL[tab]}
            </button>
          ))}
        </nav>

        {offers.length >= 15 ? (
          <div className="mt-2 hidden items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-sm lg:flex">
            <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
            {filterControls}
            {activeFilters > 0 ? (
              <button
                onClick={() => router.replace(pathname, { scroll: false })}
                className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
              >
                Clear {activeFilters}
              </button>
            ) : null}
          </div>
        ) : (
          // Small inventories don't warrant a permanent six-control rail —
          // search, sort and the category tabs above already cover them.
          <details className="mt-2 hidden rounded-lg border bg-background shadow-sm lg:block">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground">
              <SlidersHorizontal className="size-4 shrink-0" />
              More filters
              {activeFilters ? ` (${activeFilters} active)` : ""}
            </summary>
            <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2">
              {filterControls}
              {activeFilters > 0 ? (
                <button
                  onClick={() => router.replace(pathname, { scroll: false })}
                  className="ml-auto text-xs font-semibold text-emerald-700 hover:underline"
                >
                  Clear {activeFilters}
                </button>
              ) : null}
            </div>
          </details>
        )}

        <div className="mt-2 flex items-center justify-between lg:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setFiltersOpen(true)}
            className="gap-2 bg-background"
          >
            <Filter className="size-3.5" /> Filters
            {activeFilters ? ` (${activeFilters})` : ""}
          </Button>
          <p className="text-xs text-muted-foreground">
            {pluralise(visible.length, "offer")}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-semibold">
              {offers.length === 0
                ? "No gift card offers published yet"
                : "No offers match these filters"}
            </p>
            <p className="max-w-md px-4 text-sm text-muted-foreground">
              {offers.length === 0
                ? "New reviewed offers will appear here as they are approved. Unreviewed offers are never shown."
                : "Try another category or clear your filters. New offers appear only after manual review."}
            </p>
            {offers.length > 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3 hidden items-center justify-between lg:flex">
              <p className="text-xs text-muted-foreground">
                Showing {pluralise(visible.length, "approved offer")}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((offer) => (
                <GiftCardOfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          </>
        )}

        <section className="mt-7 grid gap-3 rounded-xl border bg-background p-4 text-xs text-muted-foreground shadow-sm sm:grid-cols-2 sm:p-5">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0 text-emerald-700" />
            <p>
              <strong className="text-foreground">How we value offers:</strong>{" "}
              direct discounts are shown as stated. Bonus value and points use
              disclosed estimates; points are not cash and redemption value
              varies.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              <strong className="text-foreground">
                Freshness and sourcing:
              </strong>{" "}
              every listing is reviewed before publication. Check dates,
              eligibility and current terms on the detail page before buying.
            </p>
          </div>
        </section>
      </main>

      {filtersOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Gift card filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/45"
            onClick={() => setFiltersOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(88vw,360px)] flex-col bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <p className="font-bold">Filter offers</p>
                <p className="text-xs text-muted-foreground">
                  Narrow approved listings
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filter drawer"
              >
                <X />
              </Button>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto py-5 [&>label]:items-stretch">
              {filterControls}
            </div>
            <div className="mt-auto grid grid-cols-2 gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => router.replace(pathname, { scroll: false })}
              >
                Clear
              </Button>
              <Button
                onClick={() => setFiltersOpen(false)}
                className="bg-emerald-700 hover:bg-emerald-800"
              >
                Show {visible.length}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <SiteFooter />
    </div>
  );
}

export default GiftCardsClient;
