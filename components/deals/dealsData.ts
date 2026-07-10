import { Calculator, CreditCard, Flame, Gift, Star } from "lucide-react";
import type { WeeklyDealCardData } from "@/components/WeeklyDealCard";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  StackRecommendation,
  WeeklyDeal,
} from "@/lib/offers/types";
import { isExpiringSoonAU } from "@/lib/offers/expiry";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * Pure data, constants and deal builders for the Weekly Deals page — moved
 * out of DealsClient.tsx so the client component holds filter state and
 * orchestration only. Everything here is a pure function of its inputs
 * (icons are just component references); no hooks, no state.
 */

export type FilterId =
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

export const LAYER_FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "best-stacks", label: "Best stacks" },
  { id: "gift-cards", label: "Gift cards" },
  { id: "points", label: "Points" },
  { id: "cashback", label: "Cashback" },
  { id: "signals", label: "OzBargain signals" },
  { id: "expiring-soon", label: "Expiring soon" },
];

export const PROGRAM_FILTERS: { id: FilterId; label: string }[] = [
  { id: "qantas", label: "Qantas" },
  { id: "velocity", label: "Velocity" },
  { id: "everyday-rewards", label: "Everyday Rewards" },
  { id: "flybuys", label: "Flybuys" },
];

export const FILTER_LABEL: Record<FilterId, string> = Object.fromEntries(
  [...LAYER_FILTERS, ...PROGRAM_FILTERS].map((f) => [f.id, f.label])
) as Record<FilterId, string>;

export interface TaggedDeal {
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

/** "Week of D Mon YYYY" derived from the most recent weekOf date in the deals. */
export function deriveWeekLabel(deals: WeeklyDeal[]): string {
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

export type ProgrammeTone = "amber" | "sky" | "rose" | "violet";

export const PROG_TONE: Record<ProgrammeTone, string> = {
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  rose: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  violet:
    "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export const PROGRAMME_GUIDES: {
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

export type GiftSub = "all" | "discount" | "bonus" | "multi";

export const GIFT_SUB_LABEL: Record<GiftSub, string> = {
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
  return "Ongoing — verify current dates";
}

// "How DealStack checks a stack" steps.
export const CHECK_STEPS: { icon: typeof Gift; title: string; text: string }[] = [
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

export const verificationNotes = [
  "Confirm the discounted gift card is actually accepted at that store before buying.",
  "Check the cashback offer doesn't void on gift-card payment — you usually can't claim both on one order.",
  "Activate any points boost in the program app before you shop.",
];

// ─── Deal builders (pure; called over the page's prop data) ─────────────────

export type NameOf = (id: string | null) => string | null;

export function buildTaggedStacks(
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

export interface GiftTaggedDeal extends TaggedDeal {
  sub: Set<GiftSub>;
}

export function buildGiftCardDeals(offers: GiftCardOffer[]): GiftTaggedDeal[] {
  return offers.map((o): GiftTaggedDeal => {
    const tags = new Set<FilterId>(["gift-cards"]);
    const prog = programTag(o.pointsOnPurchase?.program);
    if (prog) tags.add(prog);
    const soon = isExpiringSoonAU(o.expiryDate);
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

export function buildPointsDeals(
  offers: PointsOffer[],
  nameOf: NameOf
): TaggedDeal[] {
  return offers.map((o): TaggedDeal => {
    const tags = new Set<FilterId>(["points"]);
    const prog = programTag(o.program);
    if (prog) tags.add(prog);
    const soon = isExpiringSoonAU(o.expiryDate);
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
            ? "Activated offer — activate in-app before you shop to earn the bonus."
            : "Base earn rate on eligible spend at this merchant.",
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

export function buildCashbackDeals(
  offers: CashbackOffer[],
  nameOf: NameOf
): TaggedDeal[] {
  return offers.map((o): TaggedDeal => {
    const tags = new Set<FilterId>(["cashback"]);
    if (isExpiringSoonAU(o.expiryDate)) tags.add("expiring-soon");
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
        expiringSoon: isExpiringSoonAU(o.expiryDate),
        lastCheckedAt: o.lastCheckedAt,
        confidence: o.confidence,
        citations: o.citations,
      },
    };
  });
}

export interface SignalTaggedDeal extends TaggedDeal {
  score: number;
}

export function buildSignalDeals(
  offers: OzBargainSignal[],
  nameOf: NameOf
): SignalTaggedDeal[] {
  return offers
    .map((o): SignalTaggedDeal => {
      const tags = new Set<FilterId>(["signals"]);
      const soon = isExpiringSoonAU(o.expiryDate ?? null);
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
