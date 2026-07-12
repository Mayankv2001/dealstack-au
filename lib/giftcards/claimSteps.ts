import type { GiftCardOffer } from "@/lib/offers/types";

/**
 * Original DealStack "how to claim" steps, generated ONLY from approved
 * structured fields — never from source prose. A step is included only when
 * the data behind it exists; nothing is invented. Pure and unit-testable.
 */

export interface ClaimStep {
  /** Short imperative instruction, our wording. */
  text: string;
  /** Extra qualifier rendered under the step, when the data supports one. */
  note?: string;
}

export function buildClaimSteps(offer: GiftCardOffer): ClaimStep[] {
  const steps: ClaimStep[] = [];
  const seller = offer.purchaseLocation?.trim() || offer.source.trim();

  steps.push({
    text: `Open ${seller}.`,
    note:
      offer.purchaseMethod === "in-store"
        ? "This promotion is available in-store."
        : offer.purchaseMethod === "online"
          ? "This promotion is available online."
          : offer.purchaseMethod === "online-and-in-store"
            ? "Available online and in-store."
            : undefined,
  });

  if (offer.membershipRequired) {
    steps.push({ text: "Sign in with your eligible membership." });
  }
  if (offer.activationRequired) {
    steps.push({ text: "Activate the offer before you buy." });
  }

  const formatNote =
    offer.format === "digital"
      ? "Digital cards only."
      : offer.format === "physical"
        ? "Physical cards only."
        : offer.format === "digital-and-physical"
          ? "Available as digital or physical cards."
          : undefined;
  steps.push({
    text: `Choose an eligible ${offer.brand} gift card.`,
    note: formatNote,
  });

  if (offer.minSpend != null && offer.minSpend > 0) {
    steps.push({ text: `Meet the $${offer.minSpend} minimum spend.` });
  }

  if (offer.couponRequired || offer.promoCode) {
    steps.push({
      text: offer.promoCode
        ? `Enter promo code ${offer.promoCode} at checkout.`
        : "Enter the promo code from the source at checkout.",
    });
  }

  const hasVisibleValue =
    offer.discountPercent > 0 || (offer.bonusPercent ?? 0) > 0;
  if (hasVisibleValue) {
    steps.push({ text: "Check the saving is applied before you pay." });
  }

  steps.push({
    text: "Complete payment.",
    note: offer.shippingMayApply
      ? "Physical cards may attract a shipping fee."
      : undefined,
  });

  return steps;
}
