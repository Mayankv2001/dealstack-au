/**
 * Promotion-specific VALUE readiness — the rule that an offer must carry the
 * data its own mechanic promises before it may face the public.
 *
 * A title, seller, start date and expiry are not an offer. A "discount" with
 * no percentage, a "points" promotion with neither a multiplier nor a fixed
 * award, or a record whose only content is a generic card-family name gives a
 * shopper nothing actionable — and worse, it *looks* reviewed.
 *
 * This module is the ONE place that rule lives:
 *   - `giftCardPublishError` (lib/giftcards/publishReadiness.ts) calls it at
 *     publish/re-publish time, on top of its identity/date requirements;
 *   - the public repository read path calls it via `hasPublicOfferValue` so a
 *     legacy or corrupted row that predates the rule can never render — the
 *     detail route resolves to the normal notFound() instead.
 *
 * The rule is deliberately about DATA PRESENCE, not valuation: a fixed-points
 * offer in a programme we cannot price is still publishable — the points
 * amount and conditions are real, useful facts. Nothing here requires a cash
 * saving to be computable.
 */

export interface OfferValueFacts {
  /** Absent on legacy rows — the mechanic is then inferred from the values. */
  promotionType?: string | null;
  discountPercent?: number | null;
  bonusPercent?: number | null;
  pointsMultiplier?: number | null;
  fixedPoints?: number | null;
  pointsProgram?: string | null;
  fixedDiscountDollars?: number | null;
  promoCreditDollars?: number | null;
  feeWaiverDollars?: number | null;
  thresholdDollars?: number | null;
  membershipRequired?: boolean | null;
  expiryDate?: string | null;
  isOngoing?: boolean | null;
}

const positive = (value: number | null | undefined): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * Infer the mechanic of a legacy row that predates `promotion_type`. Returns
 * null when no structured value field identifies one — which is itself the
 * finding: the row has no promotion-specific data.
 */
export function inferPromotionType(facts: OfferValueFacts): string | null {
  if (positive(facts.discountPercent)) return "discount";
  if (positive(facts.bonusPercent)) return "bonus-value";
  if (
    (positive(facts.pointsMultiplier) || positive(facts.fixedPoints)) &&
    facts.pointsProgram?.trim()
  ) {
    return "points";
  }
  if (positive(facts.fixedDiscountDollars) && positive(facts.thresholdDollars)) {
    return "fixed-dollar-discount";
  }
  if (positive(facts.promoCreditDollars) && positive(facts.thresholdDollars)) {
    return "promo-credit";
  }
  return null;
}

/**
 * The promotion-specific value gap, or null when the offer carries the data
 * its mechanic promises. Messages are admin-facing: they say exactly what a
 * reviewer must supply (or correct) before the record can face the public.
 */
export function promotionValueGap(facts: OfferValueFacts): string | null {
  // Contradictions first — they mean the record cannot be trusted as-is.
  if (facts.expiryDate && facts.isOngoing === true) {
    return "An offer cannot have both an expiry date and ongoing status.";
  }
  if (positive(facts.pointsMultiplier) && positive(facts.fixedPoints)) {
    return "A points offer cannot carry both a multiplier and a fixed award — split the mechanics.";
  }

  const declared = facts.promotionType?.trim() || null;
  const type = declared ?? inferPromotionType(facts);
  if (!type) {
    return "No promotion-specific value data — a mechanic (discount, points, bonus value…) with its value is required.";
  }

  switch (type) {
    case "discount":
      return positive(facts.discountPercent)
        ? null
        : "A percentage discount needs a positive value.";
    case "bonus-value":
      return positive(facts.bonusPercent)
        ? null
        : "A bonus-value offer needs a positive bonus percentage.";
    case "points": {
      const hasAward =
        positive(facts.pointsMultiplier) || positive(facts.fixedPoints);
      if (!hasAward) {
        return "A points offer needs a multiplier or a fixed points award.";
      }
      return facts.pointsProgram?.trim()
        ? null
        : "A points offer needs its loyalty programme recorded.";
    }
    case "fixed-dollar-discount":
      return positive(facts.fixedDiscountDollars) &&
        positive(facts.thresholdDollars)
        ? null
        : "A fixed-dollar discount needs an amount and qualifying threshold.";
    case "promo-credit":
      return positive(facts.promoCreditDollars) && positive(facts.thresholdDollars)
        ? null
        : "A promo credit needs an amount and qualifying threshold.";
    case "fee-waiver":
      // The waived amount may honestly be unstated at the source.
      return null;
    case "membership":
      return positive(facts.discountPercent) && facts.membershipRequired === true
        ? null
        : "A membership rate needs a value and membership requirement.";
    case "mixed":
      return "A compound campaign summary has no single value — split it into atomic sub-offers.";
    default:
      return "A known atomic promotion type is required.";
  }
}

/**
 * Public read-path boundary: true when the row carries real promotion value
 * data. Applied to ALREADY-PUBLISHED rows, so rows approved before this rule
 * existed (or corrupted since) drop out of every public surface and their
 * detail permalinks 404 — without deleting anything or touching review state.
 */
export function hasPublicOfferValue(facts: OfferValueFacts): boolean {
  return promotionValueGap(facts) === null;
}
