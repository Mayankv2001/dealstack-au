export const ATOMIC_GIFT_CARD_PROMOTION_TYPES = [
  "discount",
  "fixed-dollar-discount",
  "bonus-value",
  "points",
  "promo-credit",
  "fee-waiver",
  "membership",
] as const;

export type AtomicGiftCardPromotionType =
  (typeof ATOMIC_GIFT_CARD_PROMOTION_TYPES)[number];

export interface GiftCardCandidateSplitPart {
  subOfferKey: string;
  brand: string;
  promotionType: AtomicGiftCardPromotionType;
  discountPercent?: number | null;
  fixedDiscountDollars?: number | null;
  bonusPercent?: number | null;
  pointsMultiplier?: number | null;
  fixedPoints?: number | null;
  pointsProgram?: string | null;
  promoCreditDollars?: number | null;
  feeWaiverDollars?: number | null;
  thresholdDollars?: number | null;
}

export type SplitDefinitionResult =
  | { ok: true; parts: GiftCardCandidateSplitPart[] }
  | { ok: false; error: string };

const positive = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Parse the explicit, review-only atomic definitions used to split a compound candidate. */
export function parseOfferSplitDefinitions(raw: string): SplitDefinitionResult {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Split definitions must be valid JSON." };
  }
  if (!Array.isArray(input) || input.length < 2 || input.length > 20) {
    return { ok: false, error: "Provide between 2 and 20 atomic sub-offers." };
  }
  const parts: GiftCardCandidateSplitPart[] = [];
  const keys = new Set<string>();
  for (const [index, value] of input.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: `Sub-offer ${index + 1} must be an object.` };
    }
    const row = value as Record<string, unknown>;
    const subOfferKey = text(row.subOfferKey);
    const brand = text(row.brand);
    const promotionType = text(row.promotionType);
    if (!subOfferKey || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(subOfferKey)) {
      return { ok: false, error: `Sub-offer ${index + 1} needs a stable lowercase key.` };
    }
    if (subOfferKey === "primary" || keys.has(subOfferKey)) {
      return { ok: false, error: "Sub-offer keys must be unique and cannot be primary." };
    }
    if (!brand) return { ok: false, error: `Sub-offer ${index + 1} needs a brand.` };
    if (!ATOMIC_GIFT_CARD_PROMOTION_TYPES.includes(promotionType as AtomicGiftCardPromotionType)) {
      return { ok: false, error: `Sub-offer ${index + 1} needs a known atomic promotion type.` };
    }
    const part: GiftCardCandidateSplitPart = {
      subOfferKey,
      brand,
      promotionType: promotionType as AtomicGiftCardPromotionType,
      discountPercent: positive(row.discountPercent),
      fixedDiscountDollars: positive(row.fixedDiscountDollars),
      bonusPercent: positive(row.bonusPercent),
      pointsMultiplier: positive(row.pointsMultiplier),
      fixedPoints: positive(row.fixedPoints),
      pointsProgram: text(row.pointsProgram),
      promoCreditDollars: positive(row.promoCreditDollars),
      feeWaiverDollars: positive(row.feeWaiverDollars),
      thresholdDollars: positive(row.thresholdDollars),
    };
    const validValue =
      (part.promotionType === "discount" && part.discountPercent != null) ||
      (part.promotionType === "membership" && part.discountPercent != null) ||
      (part.promotionType === "fixed-dollar-discount" && part.fixedDiscountDollars != null && part.thresholdDollars != null) ||
      (part.promotionType === "bonus-value" && part.bonusPercent != null) ||
      (part.promotionType === "points" && Boolean(part.pointsProgram) && ((part.pointsMultiplier != null) !== (part.fixedPoints != null))) ||
      (part.promotionType === "promo-credit" && part.promoCreditDollars != null && part.thresholdDollars != null) ||
      (part.promotionType === "fee-waiver" && part.feeWaiverDollars != null);
    if (!validValue) {
      return { ok: false, error: `Sub-offer ${index + 1} is missing the value required by its mechanic.` };
    }
    keys.add(subOfferKey);
    parts.push(part);
  }
  return { ok: true, parts };
}
