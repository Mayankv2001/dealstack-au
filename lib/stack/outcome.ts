import type { StackRecommendation } from "@/lib/offers/types";

/**
 * Shopper-facing cash-flow summary derived from the stack engine output.
 * This never recalculates eligibility or compatibility: optional components
 * remain excluded and every amount comes from the engine's chosen layers.
 */
export interface StackOutcome {
  originalCart: number;
  checkoutCost: number;
  giftCardSaving: number;
  cashbackLater: number;
  cashPaidForCheckout: number;
  effectiveFinalCost: number;
  pointsEarned: number;
  pointsValueDollars: number;
}

export function summariseStackOutcome(rec: StackRecommendation): StackOutcome {
  const included = rec.components.filter((component) => !component.optional);
  const sumLayer = (layer: "discount" | "gift-card" | "cashback") =>
    included
      .filter((component) => component.layer === layer)
      .reduce((sum, component) => sum + (component.valueDollars ?? 0), 0);

  const discountSaving = sumLayer("discount");
  const giftCardSaving = sumLayer("gift-card");
  const cashbackLater = sumLayer("cashback");
  const checkoutCost = Math.max(0, rec.basePrice - discountSaving);
  const cashPaidForCheckout = Math.max(0, checkoutCost - giftCardSaving);

  return {
    originalCart: rec.basePrice,
    checkoutCost,
    giftCardSaving,
    cashbackLater,
    cashPaidForCheckout,
    effectiveFinalCost: rec.effectivePrice,
    pointsEarned: rec.pointsEarned,
    pointsValueDollars: rec.pointsValueDollars,
  };
}
