import type { GcdbFeedItem } from "./parseGcdbFeed";
import type { WeeklyGiftCardFacts } from "./pointHacksWeekly";
import { bonusEffectiveDiscountPercent, effectiveDiscountPercent } from "./value";

/**
 * Pure candidate extraction: one parsed feed item → normalised offer fields
 * with a confidence score and explicit warnings. Nothing here publishes; the
 * output is staged for admin review. Unknowns stay null — the extractor never
 * invents rates, dates or programmes.
 */

// v4: fixed-points awards ("1,000 bonus Flybuys points") extracted as
// first-class points values — bumping re-extracts previously parsed items.
export const EXTRACTOR_VERSION = 4;

export type PromotionType =
  | "discount"
  | "fixed-dollar-discount"
  | "bonus-value"
  | "points"
  | "promo-credit"
  | "fee-waiver"
  | "membership"
  | "mixed"
  | "unknown";

export type RewardDestination =
  | "checkout-discount"
  | "gift-card-value"
  | "seller-credit"
  | "loyalty-points"
  | "waived-fee";

/** Optional structured child supplied by an approved source adapter/reviewer. */
export interface SourceSubOffer {
  /** Source-stable identity. Must not include mutable values or dates. */
  key: string;
  promotionType: Exclude<PromotionType, "mixed" | "unknown">;
  giftCardBrands: string[];
  discountPercent?: number | null;
  fixedDiscountDollars?: number | null;
  bonusPercent?: number | null;
  pointsMultiplier?: number | null;
  fixedPoints?: number | null;
  pointsProgram?: string | null;
  promoCreditDollars?: number | null;
  feeWaiverDollars?: number | null;
  thresholdDollars?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isOngoing?: boolean;
  membershipRequired?: boolean;
  activationRequired?: boolean;
  couponRequired?: boolean;
  targeted?: boolean;
}

export interface ExtractedOffer {
  subOfferKey: string;
  parentIsCompound: boolean;
  sourcePresence: "present" | "removed";
  promotionType: PromotionType;
  rewardDestination: RewardDestination | null;
  sellerName: string | null;
  giftCardBrands: string[];
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints?: number | null;
  pointsProgram: string | null;
  fixedDiscountDollars: number | null;
  promoCreditDollars: number | null;
  feeWaiverDollars: number | null;
  thresholdDollars: number | null;
  /** Shared-formula effective saving (see lib/giftcards/value.ts), or null. */
  effectiveDiscountPercent: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  isOngoing: boolean;
  sourceMarkedExpired: boolean;
  /** Stock-limited availability ("while stocks last") — never a made-up expiry. */
  whileStocksLast: boolean;
  membershipRequired: boolean;
  activationRequired: boolean;
  couponRequired: boolean;
  targeted: boolean;
  minSpend: number | null;
  purchaseLimitNote: string | null;
  /** 0–1: how confidently the structured fields were extracted. */
  confidence: number;
  warnings: string[];
  /** Source-specific factual fields retained privately for admin review. */
  weeklyFacts?: WeeklyGiftCardFacts;
}

const PROGRAM_PATTERNS: Array<[RegExp, string]> = [
  [/everyday\s+rewards/i, "Everyday Rewards"],
  [/flybuys/i, "Flybuys"],
  [/qantas/i, "Qantas"],
  [/velocity/i, "Velocity"],
];

const MEMBERSHIP_PATTERN = /\b(members?|membership|racv|nrma|racq|ract|raa|union\s*shopper)\b/i;

/** "$30", "$1,000" → number. */
function firstDollars(text: string, pattern: RegExp): number | null {
  const match = text.replace(/,/g, "").match(pattern);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function rewardDestination(type: PromotionType): RewardDestination | null {
  switch (type) {
    case "discount":
    case "fixed-dollar-discount":
    case "membership":
      return "checkout-discount";
    case "bonus-value":
      return "gift-card-value";
    case "points":
      return "loyalty-points";
    case "promo-credit":
      return "seller-credit";
    case "fee-waiver":
      return "waived-fee";
    default:
      return null;
  }
}

function stableKey(raw: string): string {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  if (!key) throw new Error("A structured sub-offer needs a stable key.");
  return key;
}

/** More than one distinct mechanic/value means the source must be split. */
export function hasCompoundMechanics(text: string): boolean {
  const mechanics = new Set<string>();
  if (/\d+(?:\.\d+)?\s*%\s*(?:off|discount)/i.test(text)) {
    mechanics.add("percentage-discount");
  }
  if (/\$\s*\d+(?:\.\d+)?\s+off\b/i.test(text)) {
    mechanics.add("fixed-dollar-discount");
  }
  if (/\$\s*\d+(?:\.\d+)?\s+(?:promo\s+)?credit\b/i.test(text)) {
    mechanics.add("promo-credit");
  }
  if (/\b(?:no|waived?)\s+(?:purchase\s+)?fee\b/i.test(text)) {
    mechanics.add("fee-waiver");
  }
  if (/\bbonus\s+\d+(?:\.\d+)?\s*%\s+value\b|\d+(?:\.\d+)?\s*%\s+bonus\s+value\b/i.test(text)) {
    mechanics.add("bonus-value");
  }
  if (/\b\d[\d,]*\s+bonus\s+(?:[A-Za-z][A-Za-z ]{0,24}?\s+)?points?\b/i.test(text)) {
    mechanics.add("fixed-points");
  }
  const multipliers = [
    ...text.matchAll(/\b(\d{1,3})\s*x\b/gi),
  ].map((match) => match[1]);
  for (const multiplier of new Set(multipliers)) mechanics.add(`points-${multiplier}`);
  return mechanics.size > 1;
}

function extractSingleOffer(item: GcdbFeedItem): ExtractedOffer {
  const warnings: string[] = [];
  const text = `${item.title} ${item.excerpt}`;

  // ── Promotion values ───────────────────────────────────────────────────
  // Order matters: "10% bonus value" must not be read as a plain discount.
  const bonusMatch = text.match(
    /(?:bonus\s*)?(\d{1,2}(?:\.\d)?)\s*%\s*(?:bonus\s*)?(?:extra\s*)?(?:value|credit)/i
  );
  const bonusPercent = bonusMatch ? Number(bonusMatch[1]) : null;
  const discountMatch = bonusMatch
    ? null
    : text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:off|discount)/i);
  const discountPercent = discountMatch ? Number(discountMatch[1]) : null;
  const multiplierMatch = text.match(/(\d{1,3})\s*x\s*(?:[A-Za-z ]{0,24}?points?|everyday|flybuys|qantas|velocity)/i);
  const pointsMultiplier = multiplierMatch ? Number(multiplierMatch[1]) : null;
  // Fixed award: "1,000 bonus Flybuys points" / "earn 2,000 points per eligible
  // card". A fixed award and a spend multiplier are different mechanics — the
  // "Nx" form always wins when present, and a fixed award is only read from
  // the explicit bonus/per-card phrasings, never from a bare number.
  const fixedPointsMatch = pointsMultiplier
    ? null
    : (text.replace(/,/g, "").match(
        /\b(\d{2,6})\s+bonus\s+(?:[A-Za-z][A-Za-z ]{0,24}?\s+)?points?\b/i,
      ) ??
      text.replace(/,/g, "").match(
        /\bbonus\s+(\d{2,6})\s+(?:[A-Za-z][A-Za-z ]{0,24}?\s+)?points?\b/i,
      ) ??
      text.replace(/,/g, "").match(
        /\b(\d{2,6})\s+(?:[A-Za-z][A-Za-z ]{0,24}?\s+)?points?\s+(?:per|when|for)\b/i,
      ));
  const fixedPoints = fixedPointsMatch ? Number(fixedPointsMatch[1]) : null;
  const pointsProgram =
    PROGRAM_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  // ── Promotion type ────────────────────────────────────────────────────
  // GCDB's category is intentionally coarse: a real "Bonus 10% value" item
  // is tagged "Discount". A concrete mechanic/value in the factual title is
  // therefore stronger evidence; the source category is only a fallback.
  let promotionType: PromotionType = "unknown";
  if (bonusPercent) promotionType = "bonus-value";
  else if (pointsMultiplier || fixedPoints) promotionType = "points";
  else if (discountPercent) promotionType = "discount";
  else if (item.offerType?.includes("bonus")) promotionType = "bonus-value";
  else if (item.offerType === "points") promotionType = "points";
  else if (item.offerType === "discount") promotionType = "discount";
  else if (item.offerType?.includes("member")) promotionType = "membership";
  // Reconcile classification with extracted values.
  if (promotionType === "discount" && !discountPercent && bonusPercent == null) {
    warnings.push("Classified as a discount but no percentage was found.");
  }
  if (promotionType === "points" && !pointsMultiplier && !fixedPoints) {
    warnings.push(
      "Classified as a points offer but neither a multiplier nor a fixed award was found.",
    );
  }
  if (
    promotionType === "points" &&
    (pointsMultiplier || fixedPoints) &&
    !pointsProgram
  ) {
    warnings.push("Points value found but the programme is unclear.");
  }

  // ── Conditions ─────────────────────────────────────────────────────────
  const membershipRequired = MEMBERSHIP_PATTERN.test(text);
  // "No activation required" must not read as an activation requirement.
  const activationRequired =
    /\b(activate|activation|boost(?:ed)?\s+offer)\b/i.test(text) &&
    !/\b(?:no|without)\s+activation\b|\bdoes\s+not\s+require\s+activation\b|\bactivation\s+(?:is\s+)?not\s+required\b/i.test(
      text,
    );
  const couponRequired = /\b(promo\s*code|coupon|use\s+code)\b/i.test(text);
  const minSpend = firstDollars(text, /min(?:imum)?\s+spend[^$]{0,12}\$\s*(\d+(?:\.\d{1,2})?)/i);
  const limitMatch = text.match(/limit[^.,;]{0,60}/i);
  const purchaseLimitNote = limitMatch ? limitMatch[0].trim() : null;

  if (membershipRequired && promotionType === "unknown") {
    promotionType = "membership";
  }

  // ── Confidence ─────────────────────────────────────────────────────────
  let confidence = 0.2;
  if (item.sellerName) confidence += 0.2;
  else warnings.push("No seller found in the source item.");
  if (item.giftCardBrands.length > 0) confidence += 0.2;
  else warnings.push("No gift-card brand found in the source item.");
  if (discountPercent || bonusPercent || pointsMultiplier || fixedPoints) {
    confidence += 0.25;
  } else warnings.push("No promotion value could be extracted.");
  const whileStocksLast = item.whileStocksLast === true;
  if (item.endsAt) confidence += 0.15;
  else if (whileStocksLast) {
    warnings.push(
      "Availability is stock-limited (while stocks last) — no fixed end date at the source."
    );
  } else warnings.push("No end date found — confirm at the source.");
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    subOfferKey: "primary",
    parentIsCompound: false,
    sourcePresence: "present",
    promotionType,
    rewardDestination: rewardDestination(promotionType),
    sellerName: item.sellerName,
    giftCardBrands: item.giftCardBrands,
    discountPercent,
    bonusPercent,
    pointsMultiplier,
    fixedPoints,
    pointsProgram,
    fixedDiscountDollars: null,
    promoCreditDollars: null,
    feeWaiverDollars: null,
    thresholdDollars: minSpend,
    effectiveDiscountPercent: effectiveDiscountPercent({
      promotionType,
      discountPercent,
      bonusPercent,
      pointsMultiplier,
      fixedPoints,
      pointsProgram,
    }),
    startsAt: item.startsAt,
    expiresAt: item.endsAt,
    isOngoing: item.isOngoing === true,
    sourceMarkedExpired: item.sourceMarkedExpired === true,
    whileStocksLast,
    membershipRequired,
    activationRequired,
    couponRequired,
    targeted: /\btargeted\b/i.test(text),
    minSpend,
    purchaseLimitNote,
    confidence,
    warnings,
  };
}

function extractionFromSubOffer(
  item: GcdbFeedItem,
  child: SourceSubOffer,
  parentIsCompound: boolean
): ExtractedOffer {
  const key = stableKey(child.key);
  const type = child.promotionType;
  const warnings: string[] = [];
  if (child.giftCardBrands.length === 0) warnings.push("No gift-card brand found in the sub-offer.");
  const expiresAt = child.expiresAt ?? item.endsAt;
  const isOngoing = child.isOngoing ?? item.isOngoing ?? false;
  if (!expiresAt && !isOngoing) warnings.push("No end date found — confirm at the source.");
  const effective = effectiveDiscountPercent({
    promotionType: type,
    discountPercent: child.discountPercent ?? null,
    bonusPercent: child.bonusPercent ?? null,
    pointsMultiplier: child.pointsMultiplier ?? null,
    fixedPoints: child.fixedPoints ?? null,
    pointsProgram: child.pointsProgram ?? null,
    fixedDiscountDollars: child.fixedDiscountDollars ?? null,
    promoCreditDollars: child.promoCreditDollars ?? null,
    feeWaiverDollars: child.feeWaiverDollars ?? null,
    thresholdDollars: child.thresholdDollars ?? null,
  });
  if (type !== "fee-waiver" && effective == null) {
    warnings.push("No promotion value could be extracted.");
  }
  return {
    subOfferKey: key,
    parentIsCompound,
    sourcePresence: "present",
    promotionType: type,
    rewardDestination: rewardDestination(type),
    sellerName: item.sellerName,
    giftCardBrands: [...new Set(child.giftCardBrands.map((brand) => brand.trim()).filter(Boolean))],
    discountPercent: child.discountPercent ?? null,
    bonusPercent: child.bonusPercent ?? null,
    pointsMultiplier: child.pointsMultiplier ?? null,
    fixedPoints: child.fixedPoints ?? null,
    pointsProgram: child.pointsProgram ?? null,
    fixedDiscountDollars: child.fixedDiscountDollars ?? null,
    promoCreditDollars: child.promoCreditDollars ?? null,
    feeWaiverDollars: child.feeWaiverDollars ?? null,
    thresholdDollars: child.thresholdDollars ?? null,
    effectiveDiscountPercent: effective,
    startsAt: child.startsAt ?? item.startsAt,
    expiresAt,
    isOngoing,
    sourceMarkedExpired: item.sourceMarkedExpired === true,
    whileStocksLast: item.whileStocksLast === true,
    membershipRequired: child.membershipRequired ?? false,
    activationRequired: child.activationRequired ?? false,
    couponRequired: child.couponRequired ?? false,
    targeted: child.targeted ?? false,
    minSpend: child.thresholdDollars ?? null,
    purchaseLimitNote: null,
    confidence: warnings.length === 0 ? 1 : 0.7,
    warnings,
  };
}

/**
 * One source item may yield several private review candidates. A compact RSS
 * item that merely hints at multiple mechanics is kept as a blocked compound
 * summary; an approved structured adapter/reviewer can supply distinct children.
 */
export function extractOffers(
  item: GcdbFeedItem,
  subOffers: SourceSubOffer[] = []
): ExtractedOffer[] {
  if (subOffers.length > 0) {
    const keys = subOffers.map((child) => stableKey(child.key));
    if (new Set(keys).size !== keys.length) {
      throw new Error("Structured sub-offer keys must be unique within a source item.");
    }
    return subOffers.map((child) => extractionFromSubOffer(item, child, subOffers.length > 1));
  }

  const text = `${item.title} ${item.excerpt}`;
  if (hasCompoundMechanics(text) || /[,;]\s*(?:\d+\s*x|\$\s*\d+|\d+\s*%)/i.test(text)) {
    const base = extractSingleOffer(item);
    return [
      {
        ...base,
        subOfferKey: "compound-summary",
        parentIsCompound: true,
        promotionType: "mixed",
        rewardDestination: null,
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: null,
        fixedPoints: null,
        pointsProgram: null,
        effectiveDiscountPercent: null,
        warnings: [
          ...base.warnings,
          "Compound campaign detected — split into source-stable sub-offers before approval.",
        ],
      },
    ];
  }
  return [extractSingleOffer(item)];
}

/** Backward-compatible helper for callers/tests that expect one result. */
export function extractOffer(item: GcdbFeedItem): ExtractedOffer {
  return extractOffers(item)[0];
}

export { bonusEffectiveDiscountPercent };
