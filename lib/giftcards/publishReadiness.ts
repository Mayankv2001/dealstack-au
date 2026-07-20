import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  promotionValueGap,
  type OfferValueFacts,
} from "@/lib/giftcards/valueReadiness";

/**
 * Shared fail-closed gate for the legacy/manual publish path and every
 * re-publish action. Identity/date requirements live here; the
 * promotion-specific VALUE rule is delegated to lib/giftcards/valueReadiness
 * so the publish gate and the public read-path boundary can never disagree.
 */
export interface GiftCardPublishFacts extends OfferValueFacts {
  brand: string | null;
  seller: string | null;
  sourceUrl: string | null;
  promotionType: string | null;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  /** A fixed points award — a first-class alternative to a multiplier. */
  fixedPoints: number | null;
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

  // Promotion-specific value data — shared with the public read boundary.
  // A missing promotion type is NOT inferred here: publishing demands the
  // reviewer declare the mechanic explicitly.
  if (!facts.promotionType?.trim()) {
    return "A known atomic promotion type is required before publishing.";
  }
  return promotionValueGap(facts);
}
