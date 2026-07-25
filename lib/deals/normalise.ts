import type { Store } from "@/lib/data";
import { weeklyDealPath } from "@/lib/offers/dealSlug";
import type {
  CashbackOffer,
  GiftCardOffer,
  PointsOffer,
  WeeklyDeal,
} from "@/lib/offers/types";
import {
  SOURCE_META,
  type Citation,
  type Confidence,
} from "@/lib/sources/types";
import {
  safePublicSourceUrl,
} from "@/lib/security/urlPolicy";
import { sanitisePublicText } from "@/lib/stack/buildStack";
import { scoreDeal } from "./score";
import {
  KIND_LABEL,
  type DealDateStatus,
  type PublicDeal,
  type PublicDealKind,
  type TrustStatus,
} from "./types";

/**
 * Entity → PublicDeal normalisation. Pure functions of already-public data:
 * every input has crossed the publication boundary (approved signals,
 * published offers) before it reaches here. Trust labels are mapped honestly
 * from the stored confidence/source — community content is never presented
 * as verified.
 */

/** Minimal HTML-entity decode for feed-derived tags/titles. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

/** Feed price snippets often end mid-list ("$395,") — drop dangling punctuation. */
export function tidyPriceText(value: string | null | undefined): string | null {
  const tidied = value?.trim().replace(/[\s,;:.]+$/, "") ?? "";
  return tidied.length > 0 ? tidied : null;
}

/** Parse a "(was $X)" style struck price out of curated price text. */
export function parseWasPrice(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text
    .replace(/,/g, "")
    .match(/(?:was|rrp|down from)\s*\$\s*([0-9]+(?:\.[0-9]{1,2})?)/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Best-effort saving %: explicit "N% off" in the title, else price-vs-was. */
export function deriveSavingPercent(
  title: string,
  priceValue: number | null,
  wasPrice: number | null,
): number | null {
  const explicit = title.match(/(\d{1,2})\s*%\s*off/i);
  if (explicit) {
    const pct = Number(explicit[1]);
    if (pct > 0 && pct < 100) return pct;
  }
  if (priceValue != null && wasPrice != null && wasPrice > priceValue) {
    return Math.round(((wasPrice - priceValue) / wasPrice) * 100);
  }
  return null;
}

function trustFromConfidence(
  confidence: Confidence,
  kind: PublicDealKind,
): TrustStatus {
  if (confidence === "expired-unknown") return "expired";
  if (confidence === "confirmed") return "verified";
  // needs-verification: community content stays community-reported; curated
  // offers were entered from a named source, so "source checked" is accurate.
  return kind === "community" ? "community" : "source-checked";
}

function dateStatus(
  expiryDate: string | null | undefined,
  expired: boolean,
  explicitlyOngoing = false,
): DealDateStatus {
  if (expired) return "expired";
  return expiryDate || explicitlyOngoing ? "confirmed-current" : "unknown";
}

interface BuildContext {
  storeById: Map<string, Store>;
  stackableMerchantIds: Set<string>;
  now: Date;
}

function publisherFamilyFor(
  citations: Citation[],
  fallback: string = "dealstack",
): string {
  const source = citations[0]?.source;
  // Guarded: stored citations can carry source values outside SOURCE_META.
  return source ? (SOURCE_META[source]?.publisherFamily ?? fallback) : fallback;
}

function finalise(
  input: Omit<PublicDeal, "searchText" | "score">,
  extraSearch: Array<string | null | undefined>,
  now: Date,
): PublicDeal {
  let partial = input;
  partial = {
    ...partial,
    title: sanitisePublicText(partial.title),
    summary: sanitisePublicText(partial.summary),
    // Price text can carry development wording too ("$40 back (sample)").
    priceText: partial.priceText
      ? tidyPriceText(sanitisePublicText(partial.priceText))
      : partial.priceText,
  };
  const searchText = [
    partial.title,
    partial.summary,
    partial.merchantName,
    partial.category,
    partial.sourceName,
    KIND_LABEL[partial.kind],
    partial.couponCode,
    partial.priceText,
    ...partial.tags,
    ...extraSearch,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return { ...partial, searchText, score: scoreDeal(partial, now) };
}

const CHANNEL_NOTE: Record<string, string> = {
  online: "Online",
  "in-store": "In-store",
  "online-and-in-store": "Online & in-store",
};

export function fromGiftCard(
  offer: GiftCardOffer,
  ctx: BuildContext,
): PublicDeal {
  const merchantId =
    offer.acceptedAtMerchantIds.length === 1
      ? offer.acceptedAtMerchantIds[0]
      : null;
  const store = merchantId ? (ctx.storeById.get(merchantId) ?? null) : null;
  const title =
    offer.discountPercent > 0
      ? `${offer.discountPercent}% off ${offer.brand} gift cards`
      : offer.pointsOnPurchase
        ? `${offer.brand} gift cards — ${offer.pointsOnPurchase.earnNote}`
        : `${offer.brand} gift card offer`;
  const summary =
    offer.discountPercent > 0
      ? `${offer.discountPercent}% off face value via ${offer.source}${
          offer.capDollars ? ` (up to $${offer.capDollars} spend)` : ""
        }.`
      : offer.pointsOnPurchase
        ? `${offer.pointsOnPurchase.earnNote} via ${offer.source}.`
        : `${offer.brand} cards via ${offer.source}.`;
  const sourceUrl =
    (offer.sourceDetailUrl
      ? safePublicSourceUrl(offer.sourceDetailUrl)
      : null) ??
    (offer.citations[0]
      ? safePublicSourceUrl(offer.citations[0].sourceUrl)
      : null);
  return finalise(
    {
      id: `gift-card:${offer.id}`,
      kind: "gift-card",
      title,
      summary,
      merchantId,
      merchantName: store?.name ?? null,
      category: KIND_LABEL["gift-card"],
      tags: (offer.acceptedAt ?? []).slice(0, 8),
      priceText: null,
      priceValue: null,
      wasPrice: null,
      savingPercent: offer.discountPercent > 0 ? offer.discountPercent : null,
      couponCode: null,
      trust: trustFromConfidence(offer.confidence, "gift-card"),
      dealStackVerified: offer.confidence === "confirmed" && sourceUrl !== null,
      membershipRequired: offer.channel === "membership-portal",
      activationRequired: false,
      targeted: false,
      channelNote:
        offer.purchaseMethod && offer.purchaseMethod !== "unknown"
          ? CHANNEL_NOTE[offer.purchaseMethod]
          : null,
      postedAt: offer.startDate,
      lastCheckedAt: offer.lastCheckedAt,
      expiryDate: offer.expiryDate,
      dateStatus: dateStatus(
        offer.expiryDate,
        offer.confidence === "expired-unknown",
        offer.isOngoing === true,
      ),
      sourceName: offer.source,
      publisherFamily: publisherFamilyFor(offer.citations),
      capturedAt: offer.lastCheckedAt,
      sourceUrl,
      detailPath: null,
      stackable: true, // a discounted gift card is itself a stack layer
      productGroup: null,
      sourceNativeId: null,
      votes: null,
      comments: null,
    },
    [offer.brand, offer.pointsOnPurchase?.program, offer.purchaseLocation],
    ctx.now,
  );
}

export function fromCashback(
  offer: CashbackOffer,
  ctx: BuildContext,
): PublicDeal {
  const store = ctx.storeById.get(offer.merchantId) ?? null;
  const rate =
    offer.flatAmount != null ? `$${offer.flatAmount}` : `${offer.ratePercent}%`;
  const sourceUrl = offer.citations[0]
    ? safePublicSourceUrl(offer.citations[0].sourceUrl)
    : null;
  return finalise(
    {
      id: `cashback:${offer.id}`,
      kind: "cashback",
      title: `${rate} cashback at ${store?.name ?? offer.merchantId} via ${offer.provider}`,
      summary: offer.termsSummary,
      merchantId: offer.merchantId,
      merchantName: store?.name ?? null,
      category: KIND_LABEL.cashback,
      tags: offer.isUpsized ? ["Upsized rate"] : [],
      priceText: null,
      priceValue: null,
      wasPrice: null,
      savingPercent: offer.ratePercent > 0 ? offer.ratePercent : null,
      couponCode: null,
      trust: trustFromConfidence(offer.confidence, "cashback"),
      dealStackVerified: offer.confidence === "confirmed" && sourceUrl !== null,
      membershipRequired: false,
      activationRequired: false,
      targeted: false,
      channelNote: "Online",
      postedAt: null,
      lastCheckedAt: offer.lastCheckedAt,
      expiryDate: offer.expiryDate,
      dateStatus: dateStatus(
        offer.expiryDate,
        offer.confidence === "expired-unknown",
      ),
      sourceName: offer.provider,
      publisherFamily: publisherFamilyFor(
        offer.citations,
        offer.provider.toLowerCase(),
      ),
      capturedAt: offer.lastCheckedAt,
      sourceUrl,
      detailPath: null,
      stackable: ctx.stackableMerchantIds.has(offer.merchantId),
      productGroup: null,
      sourceNativeId: null,
      votes: null,
      comments: null,
    },
    [
      offer.provider,
      offer.excludesGiftCardPayment ? "excludes gift card payment" : null,
    ],
    ctx.now,
  );
}

export function fromPoints(offer: PointsOffer, ctx: BuildContext): PublicDeal {
  const store = offer.merchantId
    ? (ctx.storeById.get(offer.merchantId) ?? null)
    : null;
  const boost = offer.mechanism === "in-store-boost";
  const sourceUrl = offer.citations[0]
    ? safePublicSourceUrl(offer.citations[0].sourceUrl)
    : null;
  return finalise(
    {
      id: `points:${offer.id}`,
      kind: "points",
      title: `${offer.earnRateDisplay}${store ? ` at ${store.name}` : ""}`,
      summary: boost
        ? `Activated ${offer.program} boost — activate in-app before you shop.`
        : `${offer.program} earn on eligible spend${store ? ` at ${store.name}` : ""}.`,
      merchantId: offer.merchantId,
      merchantName: store?.name ?? null,
      category: KIND_LABEL.points,
      tags: [offer.program],
      priceText: null,
      priceValue: null,
      wasPrice: null,
      savingPercent: null,
      couponCode: null,
      trust: trustFromConfidence(offer.confidence, "points"),
      dealStackVerified: offer.confidence === "confirmed" && sourceUrl !== null,
      membershipRequired: false,
      activationRequired: boost,
      targeted: false,
      channelNote: boost ? "In-store" : null,
      postedAt: null,
      lastCheckedAt: offer.lastCheckedAt,
      expiryDate: offer.expiryDate,
      dateStatus: dateStatus(
        offer.expiryDate,
        offer.confidence === "expired-unknown",
      ),
      sourceName: offer.program,
      publisherFamily: publisherFamilyFor(
        offer.citations,
        offer.program.toLowerCase(),
      ),
      capturedAt: offer.lastCheckedAt,
      sourceUrl,
      detailPath: null,
      stackable:
        offer.merchantId != null &&
        ctx.stackableMerchantIds.has(offer.merchantId),
      productGroup: null,
      sourceNativeId: null,
      votes: null,
      comments: null,
    },
    [offer.program, offer.mechanism],
    ctx.now,
  );
}

export function fromWeeklyDeal(
  deal: WeeklyDeal,
  ctx: BuildContext,
): PublicDeal {
  const store = deal.merchantId
    ? (ctx.storeById.get(deal.merchantId) ?? null)
    : null;
  return finalise(
    {
      id: `editorial:${deal.id}`,
      kind: "editorial",
      title: deal.title,
      summary: deal.summary,
      merchantId: deal.merchantId,
      merchantName: store?.name ?? null,
      category: KIND_LABEL.editorial,
      tags: [],
      priceText: null,
      priceValue: null,
      wasPrice: null,
      savingPercent: null,
      couponCode: null,
      trust: trustFromConfidence(deal.confidence, "editorial"),
      dealStackVerified: false,
      membershipRequired: false,
      activationRequired: false,
      targeted: false,
      channelNote: null,
      postedAt: deal.weekOf,
      lastCheckedAt: null,
      expiryDate: deal.expiryDate,
      dateStatus: dateStatus(
        deal.expiryDate,
        deal.confidence === "expired-unknown",
      ),
      sourceName: "DealStack editorial",
      publisherFamily: "dealstack",
      capturedAt: deal.weekOf,
      sourceUrl: null,
      detailPath: weeklyDealPath(deal),
      stackable:
        deal.merchantId != null &&
        ctx.stackableMerchantIds.has(deal.merchantId),
      productGroup: null,
      sourceNativeId: null,
      votes: null,
      comments: null,
    },
    [],
    ctx.now,
  );
}

export interface PublicDealInputs {
  stores: Store[];
  giftCards: GiftCardOffer[];
  cashback: CashbackOffer[];
  points: PointsOffer[];
  weekly: WeeklyDeal[];
  /** Merchant ids the stack engine produced a recommendation for. */
  stackableMerchantIds: Set<string>;
}

/** Build the full normalised pool the /deals page queries over. */
export function buildPublicDeals(
  inputs: PublicDealInputs,
  now: Date = new Date(),
): PublicDeal[] {
  const ctx: BuildContext = {
    storeById: new Map(inputs.stores.map((s) => [s.id, s])),
    stackableMerchantIds: inputs.stackableMerchantIds,
    now,
  };
  return [
    ...inputs.weekly.map((d) => fromWeeklyDeal(d, ctx)),
    ...inputs.giftCards.map((o) => fromGiftCard(o, ctx)),
    ...inputs.cashback.map((o) => fromCashback(o, ctx)),
    ...inputs.points.map((o) => fromPoints(o, ctx)),
  ];
}
