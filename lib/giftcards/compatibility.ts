import type {
  CashbackOffer,
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
} from "@/lib/offers/types";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import {
  expirySoonWarning,
  giftCardCashbackConflictWarning,
  needsVerificationWarning,
  staleDataWarning,
} from "@/lib/stack/compatibility";
import { offerEffectiveSaving } from "./publicQuery";
import {
  canonicalAcceptanceStatus,
  deriveAcceptanceFreshness,
  isPositiveAcceptance,
} from "./acceptanceModel";

/**
 * Structured gift-card compatibility — a single verdict + human-readable reason
 * for whether an APPROVED offer can be stacked, plus the caveats to check.
 *
 * This is ADDITIVE to the stack engine's StackWarning output, not a replacement:
 * the overlapping caveats (expiry-soon, stale-data, needs-verification, the
 * cashback gift-card-payment exclusion) are produced by the SAME rule builders
 * in lib/stack/compatibility, so the wording can never diverge from what a
 * stack shows. Gift-card-specific conditions (membership / activation / coupon /
 * caps / points-are-estimates) are layered on top.
 *
 * Pure and deterministic — the clock is injected so it is unit-testable.
 */

export type GiftCardCompatibilityStatus =
  | "compatible"
  | "likely-compatible"
  | "incompatible"
  | "requires-verification"
  | "insufficient-evidence";

export interface GiftCardCompatibilityResult {
  status: GiftCardCompatibilityStatus;
  /** One-sentence headline verdict. */
  reason: string;
  /** Human-readable caveats to check before relying on the offer. */
  warnings: string[];
}

export interface GiftCardCompatibilityContext {
  now?: Date;
  /** Target store to check acceptance (and code interplay) against, if any. */
  storeId?: string | null;
  storeName?: string | null;
  /** The target store's cashback offer — enables the gift-card-payment conflict rule. */
  cashback?: CashbackOffer | null;
  /** True when the target store also has a discount code being applied. */
  hasDiscountCode?: boolean;
  acceptance?: GiftCardAcceptanceRow | null;
  product?: GiftCardProduct | null;
  redemptionChannel?: "online" | "in-store" | "app" | "phone" | null;
  purchaseAmount?: number | null;
  /** Target transaction MCC, only when recorded from reviewed evidence. */
  redemptionMcc?: number | null;
}

export const GIFT_CARD_EXCLUSION_REASONS = {
  expired: (date: string) => `The gift-card offer expired on ${date}.`,
  upcoming: (date: string) =>
    `The gift-card offer starts on ${date} and is not current yet.`,
  notAccepted: (store: string) =>
    `Published evidence says this gift card is not accepted at ${store}.`,
  staleAcceptance:
    "Merchant acceptance evidence is stale and must be rechecked before a new plan can recommend it.",
  inactiveAcceptance:
    "Merchant acceptance evidence is outside its reviewed validity window and cannot support a current plan.",
  missingAcceptance:
    "No current published merchant-acceptance evidence links this gift card to the retailer.",
  onlineUnsupported:
    "Published evidence says this gift card is not accepted online at this retailer.",
  inStoreUnsupported:
    "Published evidence says this gift card is not accepted in store at this retailer.",
  appUnsupported:
    "Published evidence says this gift card is not accepted in the retailer app.",
  phoneUnsupported:
    "Published evidence says this gift card is not accepted for phone orders.",
  cashbackConflict:
    "The cashback terms exclude gift-card payment, so both layers cannot be used on the same order.",
  splitPaymentUnsupported:
    "The remaining balance would require split payment, which this card does not support.",
  minimumSpendNotMet: (amount: number) =>
    `The $${amount} minimum gift-card purchase is not met by this plan.`,
  unsupportedMcc: (mcc: number) =>
    `The reviewed product record excludes MCC ${mcc} from redemption.`,
  valueUnknown: "No promotion value could be established for this offer.",
} as const;

export type GiftCardExclusionReasonCode = keyof typeof GIFT_CARD_EXCLUSION_REASONS;

function channelAcceptance(
  row: GiftCardAcceptanceRow,
  channel: GiftCardCompatibilityContext["redemptionChannel"],
): boolean | null {
  switch (channel) {
    case "online": return row.acceptsOnline;
    case "in-store": return row.acceptsInStore;
    case "app": return row.acceptsApp;
    case "phone": return row.acceptsPhone;
    default: return null;
  }
}

const STATUS_LABEL: Record<GiftCardCompatibilityStatus, string> = {
  compatible: "Compatible",
  "likely-compatible": "Likely compatible",
  incompatible: "Incompatible",
  "requires-verification": "Verify stacking",
  "insufficient-evidence": "Insufficient evidence",
};

/** Presentation label for a status ("Likely compatible"). */
export function compatibilityStatusLabel(
  status: GiftCardCompatibilityStatus
): string {
  return STATUS_LABEL[status];
}

export function evaluateGiftCardCompatibility(
  offer: GiftCardOffer,
  context: GiftCardCompatibilityContext = {}
): GiftCardCompatibilityResult {
  const now = context.now ?? new Date();
  const today = todayAU(now);
  const label = `The ${offer.brand} gift card offer`;
  const warnings: string[] = [];
  const add = (message: string | null | undefined) => {
    if (message) warnings.push(message);
  };

  // ── Shared caveats — the SAME builders the stack engine uses ──────────────
  add(expirySoonWarning(offer.expiryDate, now, `${offer.brand} gift cards`)?.message);
  add(staleDataWarning(offer.lastCheckedAt, now, label)?.message);
  add(needsVerificationWarning(offer.confidence, label)?.message);
  if (context.cashback) {
    add(giftCardCashbackConflictWarning(context.cashback, true)?.message);
  }

  // ── Gift-card-specific caveats ────────────────────────────────────────────
  if (offer.capDollars != null) {
    warnings.push(
      `The discount applies only to the first $${offer.capDollars} of gift-card value per order.`
    );
  }
  if (offer.membershipRequired) {
    warnings.push(
      offer.channel === "membership-portal"
        ? "Requires an eligible membership — buy through the member portal."
        : "Requires an eligible membership."
    );
  }
  if (offer.activationRequired) {
    warnings.push("You must activate the offer before you buy.");
  }
  if (offer.couponRequired) {
    warnings.push("Requires a promo code at checkout.");
  }
  if (offer.minSpend) {
    warnings.push(`A minimum spend of $${offer.minSpend} applies.`);
  }
  const isPoints =
    (offer.pointsMultiplier ?? 0) > 0 ||
    (offer.fixedPoints ?? 0) > 0 ||
    offer.pointsOnPurchase != null ||
    offer.promotionType === "points";
  if (isPoints) {
    warnings.push(
      "Points earned are valued at our published rate — an estimate, not guaranteed cash."
    );
  }
  if ((offer.bonusPercent ?? 0) > 0 || offer.promotionType === "bonus-value") {
    warnings.push(
      "Bonus value is a saving against net cost, not a cash discount off the price."
    );
  }
  if (offer.promotionType === "promo-credit") {
    warnings.push(
      "The reward is future seller promo credit, not a discount on the gift-card purchase."
    );
  }
  if (offer.promotionType === "fee-waiver") {
    warnings.push("The purchase fee is waived; the gift-card face value is not discounted.");
  }
  if (context.hasDiscountCode && offer.couponRequired) {
    warnings.push(
      "This card needs its own code — it may not combine with the store's discount code."
    );
  }

  const where = context.storeName ? ` at ${context.storeName}` : "";

  // ── Verdict (most-blocking first) ─────────────────────────────────────────

  // 1. Hard blockers → incompatible.
  if (isPastExpiry(offer.expiryDate, today)) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.expired(offer.expiryDate!),
      warnings,
    };
  }
  const acceptance = context.acceptance ?? null;
  if (
    acceptance &&
    canonicalAcceptanceStatus(acceptance) === "confirmed-not-accepted"
  ) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.notAccepted(
        context.storeName ?? "that retailer",
      ),
      warnings,
    };
  }
  if (
    context.purchaseAmount != null &&
    offer.minSpend != null &&
    context.purchaseAmount < offer.minSpend
  ) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.minimumSpendNotMet(offer.minSpend),
      warnings,
    };
  }
  if (
    context.redemptionMcc != null &&
    context.product?.unsupportedMccs.includes(context.redemptionMcc)
  ) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.unsupportedMcc(
        context.redemptionMcc,
      ),
      warnings,
    };
  }
  if (acceptance && deriveAcceptanceFreshness(acceptance, now) === "stale") {
    return {
      status: "requires-verification",
      reason: GIFT_CARD_EXCLUSION_REASONS.staleAcceptance,
      warnings,
    };
  }
  const channelValue = acceptance
    ? channelAcceptance(acceptance, context.redemptionChannel)
    : null;
  if (channelValue === false) {
    const reasons = {
      online: GIFT_CARD_EXCLUSION_REASONS.onlineUnsupported,
      "in-store": GIFT_CARD_EXCLUSION_REASONS.inStoreUnsupported,
      app: GIFT_CARD_EXCLUSION_REASONS.appUnsupported,
      phone: GIFT_CARD_EXCLUSION_REASONS.phoneUnsupported,
    };
    return {
      status: "incompatible",
      reason: reasons[context.redemptionChannel!],
      warnings,
    };
  }
  if (context.cashback?.excludesGiftCardPayment) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.cashbackConflict,
      warnings,
    };
  }
  if (
    context.product?.splitPayment === "unsupported" &&
    context.purchaseAmount != null &&
    context.product.maxDenomination != null &&
    context.purchaseAmount > context.product.maxDenomination
  ) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.splitPaymentUnsupported,
      warnings,
    };
  }
  if (
    context.storeId &&
    !acceptance &&
    !offer.acceptedAtMerchantIds.includes(context.storeId)
  ) {
    return {
      status: "incompatible",
      reason: GIFT_CARD_EXCLUSION_REASONS.notAccepted(
        context.storeName ?? "that retailer",
      ),
      warnings,
    };
  }

  // 2. Can't value or confirm → insufficient evidence.
  if (offer.confidence === "expired-unknown") {
    return {
      status: "insufficient-evidence",
      reason:
        "We can't confirm this offer is still live — treat it as unverified until checked at the source.",
      warnings,
    };
  }
  const hasValue =
    offerEffectiveSaving(offer) != null ||
    offer.pointsOnPurchase != null ||
    offer.promotionType === "membership";
  if (!hasValue) {
    return {
      status: "insufficient-evidence",
      reason: GIFT_CARD_EXCLUSION_REASONS.valueUnknown,
      warnings,
    };
  }

  // 3. Needs a user action / unverified terms → requires verification.
  const conditions: string[] = [];
  if (offer.membershipRequired) conditions.push("membership");
  if (offer.activationRequired) conditions.push("activation");
  if (offer.couponRequired) conditions.push("a promo code");
  if (conditions.length > 0) {
    return {
      status: "requires-verification",
      reason: `Usable once you meet its conditions: ${conditions.join(", ")}.`,
      warnings,
    };
  }
  if (offer.confidence === "needs-verification") {
    return {
      status: "requires-verification",
      reason: `Looks compatible${where}, but confirm the current terms at the source first.`,
      warnings,
    };
  }
  const hasAcceptanceEvidence =
    offer.acceptedAtMerchantIds.length > 0 || (offer.acceptedAt?.length ?? 0) > 0;
  if (!hasAcceptanceEvidence) {
    return {
      status: "requires-verification",
      reason:
        "No merchant-acceptance or stacking evidence is recorded — verify the retailer and payment terms first.",
      warnings,
    };
  }

  // Acceptance proves only that the instrument may be redeemed. It cannot
  // prove every stack layer or checkout condition, so it never yields the
  // strongest compatibility verdict by itself.
  if (acceptance && isPositiveAcceptance(acceptance)) {
    return {
      status: "likely-compatible",
      reason: `Current acceptance evidence covers redemption${where}; payment and stacking conditions still need checking.`,
      warnings,
    };
  }

  // 4. Confirmed, but with soft caveats → likely compatible.
  if (warnings.length > 0) {
    return {
      status: "likely-compatible",
      reason: `Compatible${where}, with a few caveats worth checking.`,
      warnings,
    };
  }

  // Offer-level merchant lists are still acceptance evidence, not proof that
  // discount codes, cashback, CLOs or points all combine. Without separate
  // structured compatibility evidence they can reach only likely-compatible.
  return {
    status: "likely-compatible",
    reason: `Recorded acceptance covers redemption${where}; payment and stacking conditions still need checking.`,
    warnings,
  };
}
