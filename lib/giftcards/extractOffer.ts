import type { GcdbFeedItem } from "./parseGcdbFeed";
import { bonusEffectiveDiscountPercent, effectiveDiscountPercent } from "./value";

/**
 * Pure candidate extraction: one parsed feed item → normalised offer fields
 * with a confidence score and explicit warnings. Nothing here publishes; the
 * output is staged for admin review. Unknowns stay null — the extractor never
 * invents rates, dates or programmes.
 */

export const EXTRACTOR_VERSION = 1;

export type PromotionType =
  | "discount"
  | "bonus-value"
  | "points"
  | "membership"
  | "unknown";

export interface ExtractedOffer {
  promotionType: PromotionType;
  sellerName: string | null;
  giftCardBrands: string[];
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  pointsProgram: string | null;
  /** Shared-formula effective saving (see lib/giftcards/value.ts), or null. */
  effectiveDiscountPercent: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  membershipRequired: boolean;
  activationRequired: boolean;
  couponRequired: boolean;
  minSpend: number | null;
  purchaseLimitNote: string | null;
  /** 0–1: how confidently the structured fields were extracted. */
  confidence: number;
  warnings: string[];
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

export function extractOffer(item: GcdbFeedItem): ExtractedOffer {
  const warnings: string[] = [];
  const text = `${item.title} ${item.excerpt}`;

  // ── Promotion values ───────────────────────────────────────────────────
  // Order matters: "10% bonus value" must not be read as a plain discount.
  const bonusMatch = text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:bonus|extra)\s*(?:value|credit)/i);
  const bonusPercent = bonusMatch ? Number(bonusMatch[1]) : null;
  const discountMatch = bonusMatch
    ? null
    : text.match(/(\d{1,2}(?:\.\d)?)\s*%\s*(?:off|discount)/i);
  const discountPercent = discountMatch ? Number(discountMatch[1]) : null;
  const multiplierMatch = text.match(/(\d{1,3})\s*x\s*(?:[A-Za-z ]{0,24}?points?|everyday|flybuys|qantas|velocity)/i);
  const pointsMultiplier = multiplierMatch ? Number(multiplierMatch[1]) : null;
  const pointsProgram =
    PROGRAM_PATTERNS.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  // ── Promotion type: trust the source's own classification first ───────
  let promotionType: PromotionType = "unknown";
  if (item.offerType === "discount") promotionType = "discount";
  else if (item.offerType === "points") promotionType = "points";
  else if (item.offerType?.includes("bonus")) promotionType = "bonus-value";
  else if (item.offerType?.includes("member")) promotionType = "membership";
  if (promotionType === "unknown") {
    if (bonusPercent) promotionType = "bonus-value";
    else if (pointsMultiplier) promotionType = "points";
    else if (discountPercent) promotionType = "discount";
  }
  // Reconcile classification with extracted values.
  if (promotionType === "discount" && !discountPercent && bonusPercent == null) {
    warnings.push("Classified as a discount but no percentage was found.");
  }
  if (promotionType === "points" && !pointsMultiplier) {
    warnings.push("Classified as a points offer but no multiplier was found.");
  }
  if (promotionType === "points" && pointsMultiplier && !pointsProgram) {
    warnings.push("Points multiplier found but the programme is unclear.");
  }

  // ── Conditions ─────────────────────────────────────────────────────────
  const membershipRequired = MEMBERSHIP_PATTERN.test(text);
  const activationRequired = /\b(activate|activation|boost(?:ed)?\s+offer)\b/i.test(text);
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
  if (discountPercent || bonusPercent || pointsMultiplier) confidence += 0.25;
  else warnings.push("No promotion value could be extracted.");
  if (item.endsAt) confidence += 0.15;
  else warnings.push("No end date found — confirm at the source.");
  confidence = Math.min(1, Math.round(confidence * 100) / 100);

  return {
    promotionType,
    sellerName: item.sellerName,
    giftCardBrands: item.giftCardBrands,
    discountPercent,
    bonusPercent,
    pointsMultiplier,
    pointsProgram,
    effectiveDiscountPercent: effectiveDiscountPercent({
      promotionType,
      discountPercent,
      bonusPercent,
      pointsMultiplier,
      pointsProgram,
    }),
    startsAt: item.startsAt,
    expiresAt: item.endsAt,
    membershipRequired,
    activationRequired,
    couponRequired,
    minSpend,
    purchaseLimitNote,
    confidence,
    warnings,
  };
}

export { bonusEffectiveDiscountPercent };
