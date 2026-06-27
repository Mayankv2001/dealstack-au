"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calculator,
  CreditCard,
  Flame,
  Gift,
  Layers,
  Plane,
  SearchX,
  ShieldCheck,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";
import CostcoHotBuys from "@/components/CostcoHotBuys";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import WeeklyDealCard, {
  type WeeklyDealCardData,
} from "@/components/WeeklyDealCard";
import type { Store } from "@/lib/data";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  StackRecommendation,
  WeeklyDeal,
} from "@/lib/offers/types";
import { formatDateAU } from "@/lib/sources/normalise";
import { cn } from "@/lib/utils";

/**
 * Interactive client for the Weekly Deals page.
 *
 * Holds filter state only. All data (stack recommendations + offers + signals)
 * is loaded on the server by app/deals/page.tsx (Supabase repos with static
 * fallback) and passed in as props — this component imports no data itself.
 */

const EXPIRY_SOON_MS = 7 * 24 * 60 * 60 * 1000;

type FilterId =
  | "all"
  | "best-stacks"
  | "gift-cards"
  | "points"
  | "cashback"
  | "signals"
  | "expiring-soon"
  | "qantas"
  | "velocity"
  | "everyday-rewards"
  | "flybuys";

const LAYER_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "best-stacks", label: "Best stacks" },
  { id: "gift-cards", label: "Gift cards" },
  { id: "points", label: "Points" },
  { id: "cashback", label: "Cashback" },
  { id: "signals", label: "OzBargain signals" },
  { id: "expiring-soon", label: "Expiring soon" },
];

const PROGRAM_FILTERS: { id: FilterId; label: string }[] = [
  { id: "qantas", label: "Qantas" },
  { id: "velocity", label: "Velocity" },
  { id: "everyday-rewards", label: "Everyday Rewards" },
  { id: "flybuys", label: "Flybuys" },
];

const FILTER_LABEL: Record<FilterId, string> = Object.fromEntries(
  [...LAYER_FILTERS, ...PROGRAM_FILTERS].map((f) => [f.id, f.label])
) as Record<FilterId, string>;

interface TaggedDeal {
  tags: Set<FilterId>;
  data: WeeklyDealCardData;
}

function programTag(program: string | null | undefined): FilterId | null {
  const p = (program ?? "").toLowerCase();
  if (p.includes("qantas")) return "qantas";
  if (p.includes("velocity")) return "velocity";
  if (p.includes("flybuys")) return "flybuys";
  if (p.includes("everyday")) return "everyday-rewards";
  return null;
}

function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false;
  const diff =
    new Date(`${expiry}T23:59:59+10:00`).getTime() - Date.now();
  return diff >= 0 && diff <= EXPIRY_SOON_MS;
}

/** "Week of D Mon YYYY" derived from the most recent weekOf date in the deals. */
function deriveWeekLabel(deals: WeeklyDeal[]): string {
  const latest = deals
    .map((d) => d.weekOf)
    .filter(Boolean)
    .sort()
    .at(-1);
  if (!latest) return "Latest deals";
  const [y, m, d] = latest.split("-").map(Number);
  const MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return y && m && d ? `Week of ${d} ${MONTHS[m - 1]} ${y}` : "Latest deals";
}

// ─── Points programme quick-guide content (FreePoints-style) ───────────────

type ProgrammeTone = "amber" | "sky" | "rose" | "violet";

const PROG_TONE: Record<ProgrammeTone, string> = {
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const PROGRAMME_GUIDES: {
  id: FilterId;
  name: string;
  tone: ProgrammeTone;
  earn: string;
  convert: string;
  bestUse: string;
}[] = [
  {
    id: "everyday-rewards",
    name: "Everyday Rewards",
    tone: "amber",
    earn: "Woolworths, BIG W, BWS, Ampol & partners",
    convert: "2,000 points = $10 off or 1,000 Qantas points",
    bestUse: "Pay with discounted WISH gift cards while scanning to stack both.",
  },
  {
    id: "flybuys",
    name: "Flybuys",
    tone: "sky",
    earn: "Coles, Kmart, Target, Liquorland & partners",
    convert: "2,000 points = $10 off or 1,000 Velocity points",
    bestUse: "Activate boosters, then pay with discounted Coles Group cards.",
  },
  {
    id: "qantas",
    name: "Qantas",
    tone: "rose",
    earn: "Qantas flights, Qantas Shopping portal & partners",
    convert: "Earn direct, or convert 2,000 Everyday Rewards → 1,000 Qantas",
    bestUse: "Pair Everyday Rewards conversion with gift-card and cashback layers.",
  },
  {
    id: "velocity",
    name: "Velocity",
    tone: "violet",
    earn: "Velocity e-Store, Virgin partners & Flybuys conversion",
    convert: "Convert 2,000 Flybuys → 1,000 Velocity (watch for transfer bonuses)",
    bestUse: "Route Flybuys earn to Velocity during transfer-bonus windows.",
  },
];

// ─── Gift-card sub-filters (GCDB-style offer-type chips) ────────────────────

type GiftSub = "all" | "discount" | "bonus" | "multi";

const GIFT_SUB_LABEL: Record<GiftSub, string> = {
  all: "All",
  discount: "Discount",
  bonus: "Bonus points",
  multi: "Multi-retailer",
};

const METHOD_LABEL: Record<
  NonNullable<GiftCardOffer["purchaseMethod"]>,
  string
> = {
  online: "Online",
  "in-store": "In-store",
  "online-and-in-store": "Online & in-store",
  unknown: "Check source",
};

function giftDateRange(start: string | null, expiry: string | null): string {
  const from = formatDateAU(start);
  const to = formatDateAU(expiry);
  if (from && to) return `${from} → ${to}`;
  if (to) return `Until ${to}`;
  if (from) return `From ${from}`;
  return "Ongoing (sample)";
}

// "How DealStack checks a stack" steps.
const CHECK_STEPS: { icon: typeof Gift; title: string; text: string }[] = [
  {
    icon: Flame,
    title: "Source signal",
    text: "Start from a community or database signal (OzBargain, GCDB, FreePoints) and link to it.",
  },
  {
    icon: Gift,
    title: "Gift card compatibility",
    text: "Check which discounted gift cards are actually accepted at that store.",
  },
  {
    icon: CreditCard,
    title: "Cashback eligibility",
    text: "Flag when cashback excludes gift card payment, so layers aren't double-counted.",
  },
  {
    icon: Star,
    title: "Points activation",
    text: "Note boosts that must be activated in the program app before you shop.",
  },
  {
    icon: Calculator,
    title: "Effective price",
    text: "Combine the compatible layers into one effective price with a confidence rating.",
  },
];

// ─── Deal builders (pure; called from the component over the prop data) ─────

type NameOf = (id: string | null) => string | null;

function buildTaggedStacks(
  recommendations: StackRecommendation[]
): { rec: StackRecommendation; tags: Set<FilterId> }[] {
  return recommendations.map((rec) => {
    const tags = new Set<FilterId>();
    const text = rec.components
      .map((c) => `${c.label} ${c.note ?? ""}`)
      .join(" ")
      .toLowerCase();
    if (text.includes("qantas")) tags.add("qantas");
    if (text.includes("velocity")) tags.add("velocity");
    if (text.includes("everyday")) tags.add("everyday-rewards");
    if (text.includes("flybuys")) tags.add("flybuys");
    if (rec.warnings.some((w) => w.code === "expiry-soon"))
      tags.add("expiring-soon");
    return { rec, tags };
  });
}

interface GiftTaggedDeal extends TaggedDeal {
  sub: Set<GiftSub>;
}

function buildGiftCardDeals(offers: GiftCardOffer[]): GiftTaggedDeal[] {
  return offers.map((o): GiftTaggedDeal => {
    const tags = new Set<FilterId>(["gift-cards"]);
    const prog = programTag(o.pointsOnPurchase?.program);
    if (prog) tags.add(prog);
    const soon = isExpiringSoon(o.expiryDate);
    if (soon) tags.add("expiring-soon");

    // GCDB-style offer-type sub-tags.
    const sub = new Set<GiftSub>();
    if (o.discountPercent > 0) sub.add("discount");
    if (o.pointsOnPurchase) sub.add("bonus");
    if ((o.acceptedAt?.length ?? 0) >= 3 || o.acceptedAtMerchantIds.length > 1)
      sub.add("multi");

    const summary =
      o.discountPercent > 0
        ? `${o.discountPercent}% off ${o.brand} cards via ${o.source}.`
        : o.pointsOnPurchase
          ? `${o.pointsOnPurchase.earnNote}.`
          : `${o.brand} cards via ${o.source}.`;

    const badge =
      o.discountPercent > 0
        ? { value: `${o.discountPercent}% OFF`, caption: "off face value" }
        : o.pointsOnPurchase
          ? { value: "Bonus", caption: "points on purchase" }
          : { value: "Offer" };

    const details = [
      o.purchaseLocation
        ? { label: "Buy at", value: o.purchaseLocation }
        : null,
      o.purchaseMethod && o.purchaseMethod !== "unknown"
        ? { label: "Where", value: METHOD_LABEL[o.purchaseMethod] }
        : null,
      { label: "Dates", value: giftDateRange(o.startDate, o.expiryDate) },
      o.limitPerCustomer
        ? { label: "Limit", value: o.limitPerCustomer }
        : null,
      o.acceptedAt && o.acceptedAt.length > 0
        ? { label: "Works at", value: o.acceptedAt.join(", ") }
        : null,
    ].filter((x): x is { label: string; value: string } => x !== null);

    return {
      tags,
      sub,
      data: {
        variant: "giftcard",
        kind: "gift-card",
        category: "Gift card",
        tone: "violet",
        icon: Gift,
        title: `${o.brand} gift cards`,
        subject: o.source,
        summary,
        badge,
        details,
        usageNotes: o.usageNotes,
        stackNotes: o.stackNotes,
        detailUrl: o.sourceDetailUrl ?? null,
        expiryDate: o.expiryDate,
        expiringSoon: soon,
        lastCheckedAt: o.lastCheckedAt,
        confidence: o.confidence,
        citations: o.citations,
      },
    };
  });
}

function buildPointsDeals(
  offers: PointsOffer[],
  nameOf: NameOf
): TaggedDeal[] {
  return offers.map((o): TaggedDeal => {
    const tags = new Set<FilterId>(["points"]);
    const prog = programTag(o.program);
    if (prog) tags.add(prog);
    const soon = isExpiringSoon(o.expiryDate);
    if (soon) tags.add("expiring-soon");
    return {
      tags,
      data: {
        variant: "points",
        kind: "points",
        category: "Points boost",
        tone: "amber",
        program: o.program,
        title:
          o.mechanism === "in-store-boost"
            ? "Activated in-store boost"
            : "Base earn rate",
        subject: nameOf(o.merchantId),
        summary:
          o.mechanism === "in-store-boost"
            ? "Sample activated offer — activate in-app before you shop to earn the bonus."
            : "Sample base earn rate on eligible spend at this merchant.",
        badge: o.earnMultiple
          ? { value: `${o.earnMultiple}×`, caption: "points" }
          : { value: o.earnRateDisplay },
        expiryDate: o.expiryDate,
        expiringSoon: soon,
        lastCheckedAt: o.lastCheckedAt,
        confidence: o.confidence,
        citations: o.citations,
      },
    };
  });
}

function buildCashbackDeals(
  offers: CashbackOffer[],
  nameOf: NameOf
): TaggedDeal[] {
  return offers.map((o): TaggedDeal => {
    const tags = new Set<FilterId>(["cashback"]);
    if (isExpiringSoon(o.expiryDate)) tags.add("expiring-soon");
    return {
      tags,
      data: {
        variant: "giftcard", // reuse the badge-banner layout, emerald-toned
        kind: "cashback",
        category: "Cashback",
        tone: "emerald",
        icon: CreditCard,
        title: `${o.provider} cashback`,
        subject: nameOf(o.merchantId),
        summary: o.termsSummary,
        badge: {
          value: `${o.ratePercent}% BACK`,
          caption: o.isUpsized ? "upsized rate" : "cashback",
        },
        expiryDate: o.expiryDate,
        expiringSoon: isExpiringSoon(o.expiryDate),
        lastCheckedAt: o.lastCheckedAt,
        confidence: o.confidence,
        citations: o.citations,
      },
    };
  });
}

interface SignalTaggedDeal extends TaggedDeal {
  score: number;
}

function buildSignalDeals(
  offers: OzBargainSignal[],
  nameOf: NameOf
): SignalTaggedDeal[] {
  return offers
    .map((o): SignalTaggedDeal => {
      const tags = new Set<FilterId>(["signals"]);
      const soon = isExpiringSoon(o.expiryDate ?? null);
      if (soon) tags.add("expiring-soon");
      return {
        tags,
        score: o.signalScore ?? 0,
        data: {
          variant: "signal",
          kind: o.dealKind,
          category: "OzBargain signal",
          tone: "orange",
          icon: Flame,
          title: o.title,
          subject: nameOf(o.merchantId),
          summary: o.summary,
          votes: o.votesSample,
          comments: o.commentCount ?? null,
          tags: o.tags,
          promoCode: o.promoCode ?? null,
          priceText: o.priceText ?? null,
          postedAt: o.postedAt,
          expiryDate: o.expiryDate ?? null,
          expiringSoon: soon,
          sourceUrl: o.sourceUrl,
          retailerUrl: o.productUrl ?? o.merchantUrl ?? null,
          isSample: o.isSample,
          lastCheckedAt: o.lastCheckedAt,
          confidence: o.confidence,
          citations: [{ source: "ozbargain", sourceUrl: o.sourceUrl }],
        },
      };
    })
    // Expired signals sink to the bottom; otherwise strongest signal first.
    .sort((a, b) => {
      const aExpired = a.data.confidence === "expired-unknown" ? 1 : 0;
      const bExpired = b.data.confidence === "expired-unknown" ? 1 : 0;
      if (aExpired !== bExpired) return aExpired - bExpired;
      return b.score - a.score;
    });
}

// ─── UI scaffolding ────────────────────────────────────────────────────────

function SectionHeading({
  icon: Icon,
  iconClass,
  title,
  subtitle,
}: {
  icon: typeof Gift;
  iconClass: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          iconClass
        )}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

const verificationNotes = [
  "Confirm the discounted gift card is actually accepted at that store before buying.",
  "Check the cashback offer doesn't void on gift-card payment — you usually can't claim both on one order.",
  "Activate any points boost in the program app before you shop.",
];

interface DealsClientProps {
  stackRecommendations: StackRecommendation[];
  /** Used to derive the week-of badge label shown in the hero. */
  weeklyDeals: WeeklyDeal[];
  stores: Store[];
  giftCardOffers: GiftCardOffer[];
  cashbackOffers: CashbackOffer[];
  pointsOffers: PointsOffer[];
  ozBargainSignals: OzBargainSignal[];
}

export default function DealsClient({
  stackRecommendations,
  weeklyDeals,
  stores,
  giftCardOffers,
  cashbackOffers,
  pointsOffers,
  ozBargainSignals,
}: DealsClientProps) {
  const [active, setActive] = useState<FilterId>("all");
  const [giftSub, setGiftSub] = useState<GiftSub>("all");

  const weekLabel = deriveWeekLabel(weeklyDeals);

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
  const topStacks = useMemo(
    () => stackRecommendations.slice(0, 3),
    [stackRecommendations]
  );
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

  const matchDeal = (d: TaggedDeal) => active === "all" || d.tags.has(active);
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
          ({ tags }) => active === "best-stacks" || tags.has(active)
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
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2">
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/">Stores</Link>
            </Button>
            <span
              aria-current="page"
              className="inline-flex h-8 items-center rounded-md bg-emerald-500/10 px-3 text-sm font-medium text-emerald-700 dark:text-emerald-400"
            >
              Deals
            </span>
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/resources">Resources</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/#calculator">Calculator</Link>
            </Button>
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
              <Sparkles className="size-3" />
              {weekLabel}
            </Badge>
            <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Weekly{" "}
              <span className="text-emerald-600 dark:text-emerald-400">
                Deals
              </span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Every rate here is{" "}
              <span className="font-medium text-foreground">
                manually curated and cached — not fetched live
              </span>
              . Each card shows when it was last checked; always confirm the
              offer at its source before buying.
            </p>
          </div>

          {/* Single strong disclaimer near the top */}
          <p className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Prices and rates move fast. Treat these as a curated starting
              point and confirm the live offer at its source before you spend.
            </span>
          </p>
        </div>

        {/* Costco Hot Buys — admin-approved Costco-tagged signals only */}
        <CostcoHotBuys signals={ozBargainSignals} />

        {/* 1 — This week's top stacks (always visible, scannable) */}
        <section className="mt-6">
          <SectionHeading
            icon={Layers}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="This week's top stacks"
            subtitle="The three strongest combined stacks on a $500 example spend."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topStacks.map((rec, i) => (
              <StackRecommendationCard
                key={rec.merchantId}
                recommendation={rec}
                compact
                rank={i + 1}
              />
            ))}
          </div>
        </section>

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

        {/* Empty state */}
        {totalVisible === 0 && (
          <div className="mt-5 flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center shadow-sm">
            <SearchX className="size-8 text-muted-foreground" />
            <p className="font-medium">No {FILTER_LABEL[active]} this week</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isProgramFilter
                ? "No direct offers for this program in the sample data. See Resources for conversion routes (e.g. Everyday Rewards → Qantas, Flybuys → Velocity)."
                : "Try another filter — new sample offers rotate each week."}
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
              These are community deal signals. Static examples are shown for the
              MVP. Real OzBargain links will appear after source monitoring is
              enabled.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visSig.map((d, i) => (
                <WeeklyDealCard key={`sig-${i}`} data={d.data} />
              ))}
            </div>
          </section>
        )}

        {/* How DealStack checks a stack */}
        <section className="mt-10">
          <SectionHeading
            icon={ShieldCheck}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            title="How DealStack checks a stack"
            subtitle="Five quick checks behind every effective price."
          />
          <Card className="gap-0 py-0 shadow-sm">
            <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-5">
              {CHECK_STEPS.map((step, i) => (
                <div key={step.title} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                      {i + 1}
                    </span>
                    <step.icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs font-semibold leading-snug">
                    {step.title}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        {/* Coming soon: weekly stack alerts (static UI only) */}
        <section className="mt-10">
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-emerald-500/40 bg-emerald-500/5 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Bell className="size-4.5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight">
                    Weekly stack alerts
                  </h2>
                  <Badge
                    variant="outline"
                    className="border-emerald-500/25 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-400"
                  >
                    Coming soon
                  </Badge>
                </div>
                <p className="mt-0.5 max-w-md text-xs text-muted-foreground">
                  Get the week&apos;s best stacks in your inbox. Not live yet —
                  no emails are collected.
                </p>
              </div>
            </div>
            <div className="flex w-full gap-2 sm:w-auto">
              <input
                type="email"
                disabled
                placeholder="you@example.com"
                aria-label="Email (coming soon)"
                className="h-9 w-full rounded-md border bg-background/60 px-3 text-sm text-muted-foreground sm:w-56"
              />
              <Button size="sm" disabled className="shrink-0">
                Notify me
              </Button>
            </div>
          </div>
        </section>

        {/* How to verify + single bottom disclaimer */}
        <section className="mt-8">
          <SectionHeading
            icon={AlertTriangle}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            title="How to verify before you buy"
            subtitle="Three quick checks that trip up stackers."
          />
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 shadow-sm sm:p-5">
            <ol className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-3">
              {verificationNotes.map((note, i) => (
                <li key={note} className="flex gap-2 text-xs leading-relaxed">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{note}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-amber-500/20 pt-3 text-xs leading-relaxed text-muted-foreground">
              <strong>Disclaimer:</strong> These are manually curated, cached
              examples — not live data. Offers change quickly. Always verify with
              the original source, cashback provider, gift card portal, or
              retailer before purchasing. DealStack AU is not affiliated with any
              retailer, program or provider mentioned.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
