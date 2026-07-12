import type {
  CashbackOffer,
  GiftCardAcceptanceRow,
  GiftCardOffer,
} from "@/lib/offers/types";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { giftCardCashbackConflictWarning } from "@/lib/stack/compatibility";
import type { GiftCardCompatibilityStatus } from "./compatibility";
import { offerEffectiveSaving } from "./publicQuery";
import { valuePointsOffer } from "./value";

/**
 * Two-stage stackability analysis for the offer detail page:
 *
 *   ACQUISITION — can you actually get the discounted card, and under what
 *   conditions (code, membership, caps, seller-promo exclusions, points)?
 *   REDEMPTION  — what happens when you SPEND the card (store acceptance,
 *   cashback gift-card-payment exclusions, code/loyalty/CLO interplay)?
 *
 * Facts the data cannot support are stated as "not recorded", never guessed;
 * verdicts reuse the same five-status vocabulary as
 * lib/giftcards/compatibility (which stays the single-verdict summary).
 * Pure and deterministic — the clock is injected.
 */

export type StackabilityFactTone = "positive" | "caution" | "negative" | "neutral";

export interface StackabilityFact {
  label: string;
  value: string;
  tone: StackabilityFactTone;
}

export interface StageAnalysis {
  stage: "acquisition" | "redemption";
  status: GiftCardCompatibilityStatus;
  /** One concise sentence supporting the verdict. */
  reason: string;
  warnings: string[];
  facts: StackabilityFact[];
}

export interface GiftCardStackability {
  acquisition: StageAnalysis;
  redemption: StageAnalysis;
}

export interface StackabilityContext {
  now?: Date;
  /** Published acceptance evidence for the offer's products, if any. */
  acceptance?: GiftCardAcceptanceRow[];
  /** Target store's cashback offer — enables the exact exclusion wording. */
  cashback?: CashbackOffer | null;
  /** Target store to assess redemption against, if any. */
  storeId?: string | null;
  storeName?: string | null;
}

const NOT_RECORDED = "Not recorded — verify at the source before relying on it.";

const round1 = (n: number) => Math.round(n * 10) / 10;

// ── Acquisition stage ─────────────────────────────────────────────────────────

function analyseAcquisition(
  offer: GiftCardOffer,
  now: Date
): StageAnalysis {
  const facts: StackabilityFact[] = [];
  const warnings: string[] = [];
  const effective = offerEffectiveSaving(offer);

  // Purchase saving
  if (offer.discountPercent > 0) {
    facts.push({
      label: "Purchase discount",
      value: `${round1(offer.discountPercent)}% off face value`,
      tone: "positive",
    });
  } else if ((offer.bonusPercent ?? 0) > 0) {
    facts.push({
      label: "Bonus value",
      value: `${round1(offer.bonusPercent!)}% extra spending power (not a cash discount)`,
      tone: "positive",
    });
  } else if (
    offer.promotionType === "fixed-dollar-discount" &&
    (offer.fixedDiscountDollars ?? 0) > 0
  ) {
    facts.push({
      label: "Checkout discount",
      value: `$${offer.fixedDiscountDollars} off when the recorded threshold is met`,
      tone: "positive",
    });
  } else if (
    offer.promotionType === "promo-credit" &&
    (offer.promoCreditDollars ?? 0) > 0
  ) {
    facts.push({
      label: "Future seller credit",
      value: `$${offer.promoCreditDollars} seller promo credit — not a checkout discount`,
      tone: "positive",
    });
    warnings.push(
      "The reward is future seller promo credit, not a discount on the gift-card purchase."
    );
  } else if (offer.promotionType === "fee-waiver") {
    facts.push({
      label: "Purchase fee",
      value: offer.feeWaiverDollars
        ? `$${offer.feeWaiverDollars} fee waived`
        : "Waived — amount not recorded",
      tone: "positive",
    });
  }

  // Points earned on purchase — always separated from cash savings.
  const program = offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null;
  const points =
    offer.pointsMultiplier && program
      ? valuePointsOffer(offer.pointsMultiplier, 100, program, offer.pointsValueCents)
      : null;
  if (points) {
    facts.push({
      label: "Points on purchase",
      value: `${offer.pointsMultiplier}× ${program} — an estimate, not cash`,
      tone: "positive",
    });
    warnings.push(
      "Points earned are valued at our published rate — an estimate, not guaranteed cash."
    );
  } else if (offer.pointsOnPurchase) {
    facts.push({
      label: "Points on purchase",
      value: `${offer.pointsOnPurchase.program} points earn — an estimate, not cash`,
      tone: "positive",
    });
  }

  // Coupon requirement
  if (offer.couponRequired || offer.promoCode) {
    facts.push({
      label: "Promo code",
      value: offer.promoCode
        ? `Required — ${offer.promoCode}`
        : "Required — code not recorded, check the source",
      tone: "caution",
    });
    warnings.push("Requires a promo code at checkout.");
  }

  // Seller promotion exclusions
  if (offer.combinableWithSellerPromotions === false) {
    facts.push({
      label: "Seller promotions",
      value: "Cannot be combined with another promotion from this seller",
      tone: "negative",
    });
    warnings.push("Cannot be combined with another promotion from this seller.");
  } else if (offer.combinableWithSellerPromotions === true) {
    facts.push({
      label: "Seller promotions",
      value: "Can be combined with the seller's other promotions",
      tone: "positive",
    });
  } else {
    facts.push({ label: "Seller promotions", value: NOT_RECORDED, tone: "neutral" });
  }

  // Payment restrictions — never guess.
  facts.push({
    label: "Payment restrictions",
    value: NOT_RECORDED,
    tone: "neutral",
  });

  // Purchase caps
  if (offer.capDollars != null) {
    facts.push({
      label: "Purchase cap",
      value: `First $${offer.capDollars.toLocaleString("en-AU")} of gift-card value`,
      tone: "caution",
    });
    warnings.push(
      `The saving applies only to the first $${offer.capDollars.toLocaleString("en-AU")} of gift-card value.`
    );
  }
  if (offer.minSpend != null && offer.minSpend > 0) {
    warnings.push(`A minimum spend of $${offer.minSpend} applies.`);
  }
  if (offer.thresholdDollars != null && offer.thresholdDollars > 0) {
    facts.push({
      label: "Qualifying threshold",
      value: `$${offer.thresholdDollars.toLocaleString("en-AU")}`,
      tone: "caution",
    });
  }
  if (offer.usesPerCustomer != null) {
    facts.push({
      label: "Uses per customer",
      value: offer.usesPerCustomer === 1 ? "One use" : `${offer.usesPerCustomer} uses`,
      tone: "caution",
    });
  }
  if (offer.membershipRequired) {
    warnings.push("Requires an eligible membership.");
  }
  if (offer.activationRequired) {
    warnings.push("You must activate the offer before you buy.");
  }

  // Verdict ladder — most blocking first.
  const today = todayAU(now);
  if (isPastExpiry(offer.expiryDate, today)) {
    return {
      stage: "acquisition",
      status: "incompatible",
      reason: `The offer expired on ${offer.expiryDate} — the card can no longer be bought at this price.`,
      warnings,
      facts,
    };
  }
  const hasValue =
    effective != null ||
    offer.pointsOnPurchase != null ||
    offer.promotionType === "membership" ||
    offer.promotionType === "fee-waiver";
  if (!hasValue) {
    return {
      stage: "acquisition",
      status: "insufficient-evidence",
      reason: "No promotion value could be established, so the acquisition saving can't be assessed.",
      warnings,
      facts,
    };
  }
  const conditions: string[] = [];
  if (offer.membershipRequired) conditions.push("membership");
  if (offer.activationRequired) conditions.push("activation");
  if (offer.couponRequired || offer.promoCode) conditions.push("a promo code");
  if (conditions.length > 0) {
    return {
      stage: "acquisition",
      status: "requires-verification",
      reason: `Buyable once you meet its conditions: ${conditions.join(", ")}.`,
      warnings,
      facts,
    };
  }
  if (offer.confidence !== "confirmed") {
    return {
      stage: "acquisition",
      status: "requires-verification",
      reason: "Confirm the current purchase terms at the source before buying.",
      warnings,
      facts,
    };
  }
  if (warnings.length > 0) {
    return {
      stage: "acquisition",
      status: "likely-compatible",
      reason: "The purchase saving is confirmed, with caveats worth checking.",
      warnings,
      facts,
    };
  }
  return {
    stage: "acquisition",
    status: "compatible",
    reason: "The purchase saving is confirmed with no recorded conditions.",
    warnings,
    facts,
  };
}

// ── Redemption stage ──────────────────────────────────────────────────────────

function analyseRedemption(
  offer: GiftCardOffer,
  context: StackabilityContext
): StageAnalysis {
  const facts: StackabilityFact[] = [];
  const warnings: string[] = [];
  const acceptance = context.acceptance ?? [];

  // Target-store acceptance
  const namedAcceptance = [
    ...offer.acceptedAtMerchantIds,
    ...(offer.acceptedAt ?? []),
  ];
  const verifiedRows = acceptance.filter(
    (row) => row.status === "verified" && row.outcome !== "unsuccessful"
  );
  if (namedAcceptance.length > 0 || acceptance.length > 0) {
    const parts: string[] = [];
    if (namedAcceptance.length > 0) {
      parts.push(`${new Set(namedAcceptance).size} listed retailer(s)`);
    }
    if (acceptance.length > 0) {
      parts.push(
        `${verifiedRows.length} verified of ${acceptance.length} recorded acceptance fact(s)`
      );
    }
    facts.push({
      label: "Store acceptance",
      value: parts.join("; "),
      tone: verifiedRows.length > 0 ? "positive" : "caution",
    });
  } else {
    facts.push({ label: "Store acceptance", value: NOT_RECORDED, tone: "neutral" });
  }

  // Cashback gift-card-payment exclusions
  const cashbackWarning = context.cashback
    ? giftCardCashbackConflictWarning(context.cashback, true)?.message
    : null;
  if (cashbackWarning) {
    facts.push({ label: "Cashback", value: cashbackWarning, tone: "negative" });
    warnings.push(cashbackWarning);
  } else {
    const generic =
      "Cashback may not track when paying with gift cards — check the portal's current terms.";
    facts.push({ label: "Cashback", value: generic, tone: "caution" });
    warnings.push(generic);
  }

  // Retailer discount-code compatibility
  facts.push({
    label: "Retailer discount codes",
    value:
      "Retailer codes may still apply, subject to the retailer's current terms.",
    tone: "caution",
  });

  // Loyalty-points eligibility at redemption
  facts.push({
    label: "Loyalty points when spending",
    value: NOT_RECORDED,
    tone: "neutral",
  });

  // Card-linked offers
  facts.push({
    label: "Card-linked offers",
    value:
      "Card-linked offers may fail when the linked payment card is not used for the transaction.",
    tone: "caution",
  });

  // Verdict ladder.
  if (
    context.storeId &&
    offer.acceptedAtMerchantIds.length > 0 &&
    !offer.acceptedAtMerchantIds.includes(context.storeId)
  ) {
    return {
      stage: "redemption",
      status: "incompatible",
      reason: `${offer.brand} gift cards are not listed as accepted at ${context.storeName ?? "that retailer"}.`,
      warnings,
      facts,
    };
  }
  if (namedAcceptance.length === 0 && acceptance.length === 0) {
    return {
      stage: "redemption",
      status: "insufficient-evidence",
      reason: "No acceptance evidence is recorded for this card yet.",
      warnings,
      facts,
    };
  }
  if (verifiedRows.length === 0) {
    return {
      stage: "redemption",
      status: "requires-verification",
      reason:
        "Acceptance is listed but not independently verified — confirm with the retailer before relying on it.",
      warnings,
      facts,
    };
  }
  if (warnings.length > 0) {
    return {
      stage: "redemption",
      status: "likely-compatible",
      reason: "Verified acceptance exists, with redemption caveats worth checking.",
      warnings,
      facts,
    };
  }
  return {
    stage: "redemption",
    status: "compatible",
    reason: "Verified acceptance with no recorded redemption caveats.",
    warnings,
    facts,
  };
}

export function analyseGiftCardStackability(
  offer: GiftCardOffer,
  context: StackabilityContext = {}
): GiftCardStackability {
  const now = context.now ?? new Date();
  return {
    acquisition: analyseAcquisition(offer, now),
    redemption: analyseRedemption(offer, context),
  };
}
