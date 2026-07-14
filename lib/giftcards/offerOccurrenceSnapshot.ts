import { safeHttpsUrl } from "@/lib/security/urlPolicy";

export const HISTORY_PROMOTION_TYPES = [
  "discount",
  "fixed-dollar-discount",
  "bonus-value",
  "points",
  "promo-credit",
  "fee-waiver",
  "membership",
] as const;

export interface ExpiredGiftCardOfferForHistory {
  id: string;
  brand: string;
  productId: string | null;
  seller: string | null;
  promotionType: string;
  discountPercent: number | null;
  fixedDiscountDollars: number | null;
  promoCreditDollars: number | null;
  feeWaiverDollars: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  fixedPoints: number | null;
  pointsProgramme: string | null;
  thresholdDollars: number | null;
  startDate: string | null;
  endDate: string | null;
  sourceUrl: string | null;
  verifiedAt: string;
}

export interface OfferOccurrenceInsert {
  source_offer_id: string;
  seller_key: string;
  seller_name: string;
  product_key: string;
  product_name: string;
  promotion_type: (typeof HISTORY_PROMOTION_TYPES)[number];
  discount_percent: number | null;
  fixed_dollars: number | null;
  bonus_percent: number | null;
  points_multiplier: number | null;
  fixed_points: number | null;
  points_programme: string | null;
  threshold_dollars: number | null;
  start_date: string | null;
  end_date: string;
  source_url: string;
  verified_at: string;
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
}

export function buildOfferOccurrenceSnapshot(
  offer: ExpiredGiftCardOfferForHistory,
  today: string
): OfferOccurrenceInsert {
  const seller = offer.seller?.trim();
  const brand = offer.brand.trim();
  if (!seller || !brand) throw new Error("Seller and product brand are required before sealing history.");
  if (!offer.endDate || offer.endDate >= today) throw new Error("Only expired offers can be sealed into public history.");
  const sourceUrl = offer.sourceUrl ? safeHttpsUrl(offer.sourceUrl) : null;
  if (!sourceUrl) throw new Error("A safe offer-level HTTPS source is required before sealing history.");
  if (!(HISTORY_PROMOTION_TYPES as readonly string[]).includes(offer.promotionType)) {
    throw new Error("This promotion mechanic cannot be represented as an atomic public occurrence.");
  }
  const promotionType = offer.promotionType as OfferOccurrenceInsert["promotion_type"];
  const fixedDollars = promotionType === "promo-credit" ? offer.promoCreditDollars : promotionType === "fee-waiver" ? offer.feeWaiverDollars : offer.fixedDiscountDollars;
  const valid =
    ((promotionType === "discount" || promotionType === "membership") && (offer.discountPercent ?? 0) > 0) ||
    (promotionType === "bonus-value" && (offer.bonusPercent ?? 0) > 0) ||
    (promotionType === "points" &&
      ((offer.pointsMultiplier ?? 0) > 0 || (offer.fixedPoints ?? 0) > 0) &&
      !((offer.pointsMultiplier ?? 0) > 0 && (offer.fixedPoints ?? 0) > 0) &&
      Boolean(offer.pointsProgramme?.trim())) ||
    ((promotionType === "fixed-dollar-discount" || promotionType === "promo-credit") && (fixedDollars ?? 0) > 0 && (offer.thresholdDollars ?? 0) > 0) ||
    (promotionType === "fee-waiver" && (fixedDollars == null || fixedDollars >= 0));
  if (!valid) throw new Error("The offer does not have the structured value required for its mechanic.");
  return {
    source_offer_id: offer.id,
    seller_key: key(seller),
    seller_name: seller,
    product_key: offer.productId?.trim() || key(brand),
    product_name: brand,
    promotion_type: promotionType,
    discount_percent: promotionType === "discount" || promotionType === "membership" ? offer.discountPercent : null,
    fixed_dollars: fixedDollars,
    bonus_percent: promotionType === "bonus-value" ? offer.bonusPercent : null,
    points_multiplier: promotionType === "points" ? offer.pointsMultiplier : null,
    fixed_points: promotionType === "points" ? offer.fixedPoints : null,
    points_programme: promotionType === "points" ? offer.pointsProgramme?.trim() || null : null,
    threshold_dollars: offer.thresholdDollars,
    start_date: offer.startDate,
    end_date: offer.endDate,
    source_url: sourceUrl,
    verified_at: offer.verifiedAt,
  };
}
