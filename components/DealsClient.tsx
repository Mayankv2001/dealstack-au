"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CreditCard,
  Flame,
  Gift,
  Layers,
  Plane,
  SearchX,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import WeeklyDealCard from "@/components/WeeklyDealCard";
import { SectionHeading } from "@/components/deals/DealsStaticSections";
import {
  buildCashbackDeals,
  buildGiftCardDeals,
  buildPointsDeals,
  buildSignalDeals,
  buildTaggedStacks,
  FILTER_LABEL,
  GIFT_SUB_LABEL,
  LAYER_FILTERS,
  PROG_TONE,
  PROGRAM_FILTERS,
  PROGRAMME_GUIDES,
  type FilterId,
  type GiftSub,
  type NameOf,
  type TaggedDeal,
} from "@/components/deals/dealsData";
import type { Store } from "@/lib/data";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  StackRecommendation,
} from "@/lib/offers/types";
import { cn } from "@/lib/utils";

/**
 * Interactive middle of the Weekly Deals page: the programme quick guide (its
 * buttons set the active filter), the filter chips, and every section whose
 * contents depend on the active filter. The static top (hero, hot buys, top
 * stacks, picks) and bottom (how-we-check, alerts, verify) sections are
 * server-rendered by app/deals/page.tsx around this component — see
 * components/deals/DealsStaticSections.tsx.
 *
 * Holds filter state only. All data is loaded on the server and passed in as
 * props — this component imports no data itself.
 */

interface DealsClientProps {
  stackRecommendations: StackRecommendation[];
  stores: Store[];
  giftCardOffers: GiftCardOffer[];
  cashbackOffers: CashbackOffer[];
  pointsOffers: PointsOffer[];
  ozBargainSignals: OzBargainSignal[];
}

export default function DealsClient({
  stackRecommendations,
  stores,
  giftCardOffers,
  cashbackOffers,
  pointsOffers,
  ozBargainSignals,
}: DealsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pendingParams = useRef(searchParams.toString());
  useEffect(() => {
    pendingParams.current = searchParams.toString();
  }, [searchParams]);
  const validFilters = new Set<FilterId>([
    "all",
    ...LAYER_FILTERS.map((filter) => filter.id),
    ...PROGRAM_FILTERS.map((filter) => filter.id),
  ]);
  const requestedFilter = searchParams.get("view") as FilterId | null;
  const active: FilterId = requestedFilter && validFilters.has(requestedFilter)
    ? requestedFilter
    : "all";
  const requestedGift = searchParams.get("gift") as GiftSub | null;
  const giftSub: GiftSub = requestedGift && ["all", "discount", "bonus", "multi"].includes(requestedGift)
    ? requestedGift
    : "all";

  function updateParam(name: "view" | "gift" | "store" | "confidence", value: string): void {
    const params = new URLSearchParams(pendingParams.current);
    if (value === "all") params.delete(name);
    else params.set(name, value);
    const query = params.toString();
    pendingParams.current = query;
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }
  const setActive = (value: FilterId) => updateParam("view", value);
  const setGiftSub = (value: GiftSub) => updateParam("gift", value);
  const requestedStore = searchParams.get("store") ?? "";
  const selectedStore = stores.find((store) => store.id === requestedStore) ?? null;
  const requestedConfidence = searchParams.get("confidence") ?? "";
  const selectedConfidence = ["confirmed", "needs-verification"].includes(requestedConfidence)
    ? requestedConfidence
    : "";

  // Merchant id → name lookup, derived from the injected stores.
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stores) m.set(s.id, s.name);
    return m;
  }, [stores]);
  const nameOf = useCallback<NameOf>(
    (id) => (id ? (storeNameById.get(id) ?? null) : null),
    [storeNameById]
  );

  // Derived view data (recomputed only when the underlying props change).
  const taggedStacks = useMemo(
    () => buildTaggedStacks(stackRecommendations),
    [stackRecommendations]
  );
  const giftCardDeals = useMemo(
    () => buildGiftCardDeals(giftCardOffers),
    [giftCardOffers]
  );
  const pointsDeals = useMemo(
    () => buildPointsDeals(pointsOffers, nameOf),
    [pointsOffers, nameOf]
  );
  const cashbackDeals = useMemo(
    () => buildCashbackDeals(cashbackOffers, nameOf),
    [cashbackOffers, nameOf]
  );
  const signalDeals = useMemo(
    () => buildSignalDeals(ozBargainSignals, nameOf),
    [ozBargainSignals, nameOf]
  );

  const matchDeal = (d: TaggedDeal) => {
    if (active !== "all" && !d.tags.has(active)) return false;
    if (selectedConfidence && d.data.confidence !== selectedConfidence) return false;
    if (selectedStore) {
      const searchable = JSON.stringify(d.data).toLowerCase();
      if (!searchable.includes(selectedStore.name.toLowerCase())) return false;
    }
    return true;
  };
  const visGift = giftCardDeals.filter(matchDeal);
  const shownGift = visGift.filter(
    (d) => giftSub === "all" || d.sub.has(giftSub)
  );
  const visPoints = pointsDeals.filter(matchDeal);
  const visCash = cashbackDeals.filter(matchDeal);
  const visSig = signalDeals.filter(matchDeal);

  // Full stacks appear only when a filter selects them (the compact strip
  // already represents stacks on the default "all" view).
  const visStacks =
    active === "all"
      ? []
      : taggedStacks.filter(
          ({ rec, tags }) =>
            (active === "best-stacks" || tags.has(active)) &&
            (!selectedStore || rec.merchantId === selectedStore.id) &&
            (!selectedConfidence || rec.confidence === selectedConfidence)
        );

  const totalVisible =
    visStacks.length +
    visGift.length +
    visPoints.length +
    visCash.length +
    visSig.length;

  const isProgramFilter =
    active === "qantas" ||
    active === "velocity" ||
    active === "everyday-rewards" ||
    active === "flybuys";

  function Chip({ id, label }: { id: FilterId; label: string }) {
    const on = active === id;
    return (
      <button
        type="button"
        onClick={() => setActive(id)}
        aria-pressed={on}
        className={cn(
          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
          on
            ? "border-emerald-600 bg-emerald-600 text-white"
            : "border-border bg-background text-muted-foreground hover:border-emerald-500/40 hover:text-foreground"
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <>
      {/* Points programme quick guide (FreePoints-style) */}
      <section className="mt-8">
        <SectionHeading
          icon={Plane}
          iconClass="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          title="Points programme quick guide"
          subtitle="How the four big programmes earn, convert and stack."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PROGRAMME_GUIDES.map((g) => (
            <Card key={g.id} className="gap-0 py-0 shadow-sm">
              <CardContent className="flex h-full flex-col gap-2 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    variant="outline"
                    className={cn("gap-1 text-[10px]", PROG_TONE[g.tone])}
                  >
                    <Star className="size-3" />
                    {g.name}
                  </Badge>
                </div>
                <dl className="space-y-1.5 text-[11px] leading-snug">
                  <div>
                    <dt className="font-semibold">Earn</dt>
                    <dd className="text-muted-foreground">{g.earn}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Convert</dt>
                    <dd className="text-muted-foreground">{g.convert}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold">In a stack</dt>
                    <dd className="text-muted-foreground">{g.bestUse}</dd>
                  </div>
                </dl>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActive(g.id)}
                  className="mt-auto w-full"
                >
                  Show {g.name} offers
                  <ArrowRight className="size-3.5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 2 — Filter chips */}
      <div className="mt-6 flex flex-wrap items-center gap-1.5">
        {LAYER_FILTERS.map((f) => (
          <Chip key={f.id} id={f.id} label={f.label} />
        ))}
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <span className="hidden text-[11px] font-medium text-muted-foreground sm:inline">
          Programs:
        </span>
        {PROGRAM_FILTERS.map((f) => (
          <Chip key={f.id} id={f.id} label={f.label} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          aria-label="Store"
          value={selectedStore?.id ?? ""}
          onChange={(event) => updateParam("store", event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All stores</option>
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <select
          aria-label="Confidence"
          value={selectedConfidence}
          onChange={(event) => updateParam("confidence", event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="">All confidence levels</option>
          <option value="confirmed">Confirmed</option>
          <option value="needs-verification">Needs verification</option>
        </select>
      </div>

      {/* Empty state */}
      {totalVisible === 0 && (
        <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
          <SearchX className="size-8 text-muted-foreground" />
          <p className="font-medium">No {FILTER_LABEL[active]} this week</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {isProgramFilter
              ? "No direct offers for this program right now. See Resources for conversion routes (e.g. Everyday Rewards → Qantas, Flybuys → Velocity)."
              : "Try another filter — offers are updated after manual review, so check back soon."}
          </p>
          <div className="mt-1 flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setActive("all")}>
              Show all
            </Button>
            {isProgramFilter && (
              <Button asChild size="sm" variant="outline">
                <Link href="/resources">Resources</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Full stacks (when a filter selects them) */}
      {visStacks.length > 0 && (
        <section className="mt-6">
          <SectionHeading
            icon={Layers}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="Stack recommendations"
            subtitle="Full breakdown of each matching stack."
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {visStacks.map(({ rec }) => (
              <StackRecommendationCard
                key={rec.merchantId}
                recommendation={rec}
                stores={stores}
              />
            ))}
          </div>
        </section>
      )}

      {/* Gift cards (GCDB-style) */}
      {visGift.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            icon={Gift}
            iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            title="Weekly gift card offers"
            subtitle="Discounted cards and bonus-points promos to pre-buy your spend."
          />

          {/* GCDB-style offer-type sub-filters */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {(["all", "discount", "bonus", "multi"] as GiftSub[]).map((s) => {
              const on = giftSub === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGiftSub(s)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                    on
                      ? "border-violet-500 bg-violet-500/15 text-violet-700 dark:text-violet-300"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  )}
                >
                  {GIFT_SUB_LABEL[s]}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setActive("cashback")}
              className="inline-flex items-center gap-1 rounded-md border border-dashed px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Cashback
              <ArrowRight className="size-2.5" />
            </button>
          </div>

          {shownGift.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownGift.map((d, i) => (
                <WeeklyDealCard key={`gc-${i}`} data={d.data} />
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              No {GIFT_SUB_LABEL[giftSub].toLowerCase()} gift cards this week.{" "}
              <button
                type="button"
                onClick={() => setGiftSub("all")}
                className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400"
              >
                Show all gift cards
              </button>
            </p>
          )}
        </section>
      )}

      {/* Points (FreePoints-style) */}
      {visPoints.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            icon={Star}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            title="Points boosts"
            subtitle="Activated multipliers and base earn rates worth stacking."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visPoints.map((d, i) => (
              <WeeklyDealCard key={`pts-${i}`} data={d.data} />
            ))}
          </div>
        </section>
      )}

      {/* Cashback */}
      {visCash.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            icon={CreditCard}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="Cashback boosts"
            subtitle="ShopBack & TopCashback rates — most can't be combined with gift-card discounts on the same order."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visCash.map((d, i) => (
              <WeeklyDealCard key={`cb-${i}`} data={d.data} />
            ))}
          </div>
        </section>
      )}

      {/* OzBargain signals (feed-style) */}
      {visSig.length > 0 && (
        <section className="mt-8">
          <SectionHeading
            icon={Flame}
            iconClass="bg-orange-500/10 text-orange-600 dark:text-orange-400"
            title="OzBargain deal signals"
            subtitle="Community-reported activity to corroborate before you act."
          />
          <p className="mb-3 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Community-reported deal signals, manually reviewed before they
            appear here. Community reports can expire or change without
            notice — verify with the retailer before you act.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visSig.map((d, i) => (
              <WeeklyDealCard key={`sig-${i}`} data={d.data} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
