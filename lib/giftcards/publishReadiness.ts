import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/** Shared fail-closed gate for the legacy/manual publish path. */
export interface GiftCardPublishFacts {
  brand: string | null;
  seller: string | null;
  sourceUrl: string | null;
  promotionType: string | null;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  pointsProgram: string | null;
  fixedDiscountDollars: number | null;
  promoCreditDollars: number | null;
  thresholdDollars: number | null;
  membershipRequired: boolean;
  expiryDate: string | null;
  isOngoing: boolean;
}

export function giftCardPublishError(facts: GiftCardPublishFacts): string | null {
  if (!facts.brand?.trim()) return "Brand is required before publishing.";
  if (!facts.seller?.trim()) return "Seller is required before publishing.";
  if (!facts.sourceUrl || !safeHttpsUrl(facts.sourceUrl)) {
    return "A safe HTTPS offer-level source URL is required before publishing.";
  }
  if (!facts.expiryDate && !facts.isOngoing) {
    return "Expiry is required unless the source was explicitly reviewed as ongoing.";
  }
  if (facts.expiryDate && facts.isOngoing) {
    return "An offer cannot have both an expiry date and ongoing status.";
  }

  switch (facts.promotionType) {
    case "discount":
      return facts.discountPercent && facts.discountPercent > 0
        ? null
        : "A percentage discount needs a positive value.";
    case "bonus-value":
      return facts.bonusPercent && facts.bonusPercent > 0
        ? null
        : "A bonus-value offer needs a positive bonus percentage.";
    case "points":
      return facts.pointsMultiplier && facts.pointsProgram?.trim()
        ? null
        : "A points offer needs a multiplier and programme.";
    case "fixed-dollar-discount":
      return facts.fixedDiscountDollars && facts.thresholdDollars
        ? null
        : "A fixed-dollar discount needs an amount and threshold.";
    case "promo-credit":
      return facts.promoCreditDollars && facts.thresholdDollars
        ? null
        : "A promo credit needs an amount and threshold.";
    case "fee-waiver":
      return null;
    case "membership":
      return facts.discountPercent && facts.membershipRequired
        ? null
        : "A membership rate needs a value and membership requirement.";
    default:
      return "A known atomic promotion type is required before publishing.";
  }
}
