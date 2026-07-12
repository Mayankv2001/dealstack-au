import { effectiveDiscountPercent } from "@/lib/giftcards/value";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  assessCompoundCampaign,
  detectMembershipSignal,
  detectSpendThreshold,
} from "@/lib/giftcards/approvalSafeguards";

/**
 * Pure validation for gift-card candidate approval — the material-field gate
 * between the review form and the approve RPC. Extracted from the server
 * action so every rule is unit-testable without auth/rate-limit scaffolding.
 *
 * Invalid input is an explicit error, never a silent null: a negative cap or
 * a malformed time must bounce back to the reviewing admin, not vanish.
 */

export const PROMOTION_TYPES = [
  "discount",
  "fixed-dollar-discount",
  "bonus-value",
  "points",
  "promo-credit",
  "fee-waiver",
  "membership",
  "mixed",
] as const;
export const REWARD_DESTINATIONS = [
  "checkout-discount",
  "gift-card-value",
  "seller-credit",
  "loyalty-points",
  "waived-fee",
] as const;
export const CHANNELS = [
  "membership-portal",
  "supermarket-promo",
  "bank-benefit",
] as const;
export const FORMATS = [
  "digital",
  "physical",
  "digital-and-physical",
  "unknown",
] as const;

/** Raw form values (strings exactly as submitted; checkboxes as booleans). */
export interface RawApprovalInput {
  brand: string;
  seller: string;
  promotionType: string;
  channel: string;
  format: string;
  discountPercent: string;
  bonusPercent: string;
  pointsMultiplier: string;
  pointsProgram: string;
  pointsValueCents: string;
  fixedDiscountDollars?: string;
  promoCreditDollars?: string;
  feeWaiverDollars?: string;
  thresholdDollars?: string;
  rewardDestination?: string;
  startDate: string;
  expiryDate: string;
  expiryTime: string;
  expiryTimezone: string;
  ongoing: boolean;
  minSpend: string;
  capDollars: string;
  usesPerCustomer: string;
  sourceUrl: string;
  termsUrl: string;
  promoCode: string;
  australiaOnly: string;
  combinableWithSellerPromotions: string;
  membershipRequired: boolean;
  activationRequired: boolean;
  couponRequired: boolean;
  shippingMayApply: boolean;
  targeted?: boolean;
  /** Data-source name (kept separate from seller) — scanned for member signals. */
  sourceName?: string;
  /** Server-derived source title/excerpt, never trusted from the browser. */
  sourceText?: string;
  /** Server-derived compound lineage. */
  parentIsCompound?: boolean;
  candidateRole?: "single-offer" | "suboffer" | "compound-summary";
  subOfferKey?: string;
  sourcePresence?: "present" | "removed";
  /** Combined limit/usage/earn text scanned for a stated spend threshold. */
  thresholdText?: string;
}

export interface ParsedApproval {
  brand: string;
  seller: string;
  promotionType: (typeof PROMOTION_TYPES)[number];
  channel: (typeof CHANNELS)[number];
  format: (typeof FORMATS)[number];
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  pointsProgram: string | null;
  pointsValueCents: number | null;
  fixedDiscountDollars: number | null;
  promoCreditDollars: number | null;
  feeWaiverDollars: number | null;
  thresholdDollars: number | null;
  rewardDestination: (typeof REWARD_DESTINATIONS)[number];
  startDate: string | null;
  expiryDate: string | null;
  expiryTime: string | null;
  expiryTimezone: string | null;
  isOngoing: boolean;
  minSpend: number | null;
  capDollars: number | null;
  usesPerCustomer: number | null;
  sourceUrl: string;
  termsUrl: string | null;
  promoCode: string | null;
  australiaOnly: boolean | null;
  combinableWithSellerPromotions: boolean | null;
  membershipRequired: boolean;
  activationRequired: boolean;
  couponRequired: boolean;
  shippingMayApply: boolean;
  targeted: boolean;
  sourceName: string;
  subOfferKey: string;
}

export type ApprovalValidation =
  | { ok: false; error: string }
  | { ok: true; values: ParsedApproval };

const err = (error: string): ApprovalValidation => ({ ok: false, error });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** "AEST"-style abbreviations or IANA zone ids like "Australia/Sydney". */
const TIMEZONE = /^([A-Z]{2,5}|[A-Za-z]+\/[A-Za-z_+-]+)$/;

/** "" → null; anything non-numeric or negative → explicit error (string). */
function nonNegative(raw: string, label: string): number | null | string {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return `${label} must be a number.`;
  if (value < 0) return `${label} cannot be negative.`;
  return value;
}

export function validateGiftCardApproval(
  input: RawApprovalInput
): ApprovalValidation {
  const brand = input.brand.trim();
  if (!brand) return err("At least one included gift-card brand is required.");
  const seller = input.seller.trim();
  if (!seller) return err("Seller is required before approval.");
  const sourceName = input.sourceName?.trim() ?? "";
  if (!sourceName) return err("Source name is required and must remain separate from the seller.");
  if (input.sourcePresence === "removed") {
    return err("This sub-offer was removed from the source and cannot be approved.");
  }

  const promotionType = input.promotionType.trim();
  if (!(PROMOTION_TYPES as readonly string[]).includes(promotionType)) {
    return err("Unknown promotion type.");
  }
  if (promotionType === "mixed" || input.candidateRole === "compound-summary") {
    return err("A compound campaign summary cannot be published — split it into atomic sub-offers first.");
  }
  const subOfferKey = input.subOfferKey?.trim() || "primary";
  if (
    input.parentIsCompound &&
    (input.candidateRole !== "suboffer" || subOfferKey === "primary" || subOfferKey === "compound-summary")
  ) {
    return err("A compound source requires a stable, separately reviewed sub-offer before approval.");
  }
  const channel = input.channel.trim();
  if (!(CHANNELS as readonly string[]).includes(channel)) {
    return err("Unknown channel.");
  }
  const format = input.format.trim();
  if (!(FORMATS as readonly string[]).includes(format)) {
    return err("Unknown format.");
  }

  // ── Promotion value ────────────────────────────────────────────────────
  const discountPercent = nonNegative(input.discountPercent, "Discount %");
  if (typeof discountPercent === "string") return err(discountPercent);
  const bonusPercent = nonNegative(input.bonusPercent, "Bonus value %");
  if (typeof bonusPercent === "string") return err(bonusPercent);
  const pointsMultiplier = nonNegative(input.pointsMultiplier, "Points multiplier");
  if (typeof pointsMultiplier === "string") return err(pointsMultiplier);
  const pointsValueCents = nonNegative(input.pointsValueCents, "Point value (cents)");
  if (typeof pointsValueCents === "string") return err(pointsValueCents);
  const pointsProgram = input.pointsProgram.trim() || null;
  const fixedDiscountDollars = nonNegative(
    input.fixedDiscountDollars ?? "",
    "Fixed discount"
  );
  if (typeof fixedDiscountDollars === "string") return err(fixedDiscountDollars);
  const promoCreditDollars = nonNegative(
    input.promoCreditDollars ?? "",
    "Promo credit"
  );
  if (typeof promoCreditDollars === "string") return err(promoCreditDollars);
  const feeWaiverDollars = nonNegative(
    input.feeWaiverDollars ?? "",
    "Waived fee"
  );
  if (typeof feeWaiverDollars === "string") return err(feeWaiverDollars);
  const thresholdDollars = nonNegative(
    input.thresholdDollars ?? "",
    "Qualifying threshold"
  );
  if (typeof thresholdDollars === "string") return err(thresholdDollars);
  const rewardDestination = input.rewardDestination?.trim() ?? "";
  if (!(REWARD_DESTINATIONS as readonly string[]).includes(rewardDestination)) {
    return err("Choose the reward destination before approval.");
  }

  if (
    promotionType === "discount" &&
    (!discountPercent || discountPercent <= 0 || discountPercent >= 100)
  ) {
    return err("A discount offer needs a percentage between 0 and 100.");
  }
  if (promotionType === "points" && (!pointsMultiplier || !pointsProgram)) {
    return err("A points offer needs a multiplier and a programme.");
  }
  if (promotionType === "bonus-value" && (!bonusPercent || bonusPercent <= 0)) {
    return err("A bonus-value offer needs a bonus percentage.");
  }
  if (
    promotionType === "fixed-dollar-discount" &&
    (!fixedDiscountDollars || !thresholdDollars)
  ) {
    return err("A fixed-dollar discount needs both a discount amount and qualifying threshold.");
  }
  if (promotionType === "promo-credit" && (!promoCreditDollars || !thresholdDollars)) {
    return err("A promo-credit offer needs both a credit amount and qualifying threshold.");
  }
  if (promotionType === "membership") {
    if (!discountPercent || discountPercent <= 0) {
      return err("A membership rate needs a percentage value.");
    }
    if (!input.membershipRequired) {
      return err("A membership rate must be marked membership required.");
    }
  }
  const expectedDestination: Record<string, string> = {
    discount: "checkout-discount",
    "fixed-dollar-discount": "checkout-discount",
    "bonus-value": "gift-card-value",
    points: "loyalty-points",
    "promo-credit": "seller-credit",
    "fee-waiver": "waived-fee",
    membership: "checkout-discount",
  };
  if (expectedDestination[promotionType] !== rewardDestination) {
    return err("Reward destination does not match the selected promotion type.");
  }
  const effective = effectiveDiscountPercent({
    promotionType,
    discountPercent: discountPercent ?? null,
    bonusPercent: bonusPercent ?? null,
    pointsMultiplier: pointsMultiplier ?? null,
    pointsProgram,
    pointsValueCents: pointsValueCents ?? null,
    fixedDiscountDollars: fixedDiscountDollars ?? null,
    promoCreditDollars: promoCreditDollars ?? null,
    feeWaiverDollars: feeWaiverDollars ?? null,
    thresholdDollars: thresholdDollars ?? null,
  });
  if (promotionType !== "membership" && promotionType !== "fee-waiver" && effective == null) {
    return err(
      "No effective value could be calculated — set a discount, bonus or points value (with a programme)."
    );
  }

  // ── URLs ───────────────────────────────────────────────────────────────
  const sourceUrlRaw = input.sourceUrl.trim();
  if (!sourceUrlRaw) return err("A source URL is required before approval.");
  const sourceUrl = safeHttpsUrl(sourceUrlRaw);
  if (!sourceUrl) return err("Source URL must be a safe HTTPS URL.");
  const termsUrlRaw = input.termsUrl.trim();
  const termsUrl = termsUrlRaw ? safeHttpsUrl(termsUrlRaw) : null;
  if (termsUrlRaw && !termsUrl) return err("Terms URL must be a safe HTTPS URL.");

  // ── Dates, expiry time and timezone ────────────────────────────────────
  const startDateRaw = input.startDate.trim();
  if (startDateRaw && !ISO_DATE.test(startDateRaw)) {
    return err("Start date must be YYYY-MM-DD.");
  }
  const expiryDateRaw = input.expiryDate.trim();
  if (expiryDateRaw && !ISO_DATE.test(expiryDateRaw)) {
    return err("Expiry date must be YYYY-MM-DD.");
  }
  const expiryDate = expiryDateRaw || null;
  if (!expiryDate && !input.ongoing) {
    return err(
      "An expiry date is required — tick “Ongoing offer (no expiry)” only when the source explicitly says the offer has no end date."
    );
  }
  if (expiryDate && input.ongoing) {
    return err("An offer can't both have an expiry date and be marked ongoing.");
  }
  const expiryTimeRaw = input.expiryTime.trim();
  if (expiryTimeRaw && !HH_MM.test(expiryTimeRaw)) {
    return err("Expiry time must be HH:MM (24-hour), e.g. 23:59.");
  }
  const expiryTime = expiryTimeRaw || null;
  if (expiryTime && !expiryDate) return err("An expiry time needs an expiry date.");
  const expiryTimezoneRaw = input.expiryTimezone.trim();
  if (expiryTimezoneRaw && !TIMEZONE.test(expiryTimezoneRaw)) {
    return err(
      "Expiry timezone must be an abbreviation like AEST or a zone id like Australia/Sydney."
    );
  }
  const expiryTimezone = expiryTimezoneRaw || null;
  if (expiryTimezone && !expiryTime) {
    return err("An expiry timezone needs an expiry time.");
  }

  // ── Caps and limits ────────────────────────────────────────────────────
  const minSpend = nonNegative(input.minSpend, "Minimum spend");
  if (typeof minSpend === "string") return err(minSpend);
  const capDollars = nonNegative(input.capDollars, "Face-value cap");
  if (typeof capDollars === "string") return err(capDollars);
  const usesPerCustomer = nonNegative(input.usesPerCustomer, "Uses per customer");
  if (typeof usesPerCustomer === "string") return err(usesPerCustomer);
  if (usesPerCustomer != null) {
    if (!Number.isInteger(usesPerCustomer)) {
      return err("Uses per customer must be a whole number.");
    }
    if (usesPerCustomer < 1) return err("Uses per customer must be at least 1.");
  }

  // ── Safeguards: compound campaign · membership signal · spend threshold ──
  // A many-brand source is usually a compound campaign (several sub-offers);
  // require the reviewer to split it or consciously confirm it is one offer.
  const compound = assessCompoundCampaign(brand);
  if (compound.isCompound && input.candidateRole !== "suboffer") {
    return err(
      `${compound.reason || "Compound campaign detected."} Split it into distinct source-stable offers before approval.`
    );
  }
  // A Prime / member-only source must carry the membership flag.
  if (
    detectMembershipSignal(seller, sourceName, brand, input.sourceText) &&
    !input.membershipRequired
  ) {
    return err(
      "The seller or source describes a Prime / member-only offer — tick “Membership required”, or correct the seller/source."
    );
  }
  // A fixed-dollar / promo-credit offer that states a spend threshold must
  // record the minimum spend, so the condition is never hidden.
  if (detectSpendThreshold(input.thresholdText) && minSpend == null) {
    return err(
      "This offer states a spend threshold — record the minimum spend so the condition is shown."
    );
  }

  // ── Tri-states: only "", "yes", "no" are meaningful ────────────────────
  const tri = (raw: string, label: string): boolean | null | string => {
    const value = raw.trim();
    if (value === "") return null;
    if (value === "yes") return true;
    if (value === "no") return false;
    return `${label} must be yes, no, or left as “not stated”.`;
  };
  const australiaOnly = tri(input.australiaOnly, "Australia-only");
  if (typeof australiaOnly === "string") return err(australiaOnly);
  const combinable = tri(
    input.combinableWithSellerPromotions,
    "Seller-promotion combinability"
  );
  if (typeof combinable === "string") return err(combinable);

  return {
    ok: true,
    values: {
      brand,
      seller,
      promotionType: promotionType as ParsedApproval["promotionType"],
      channel: channel as ParsedApproval["channel"],
      format: format as ParsedApproval["format"],
      discountPercent: discountPercent ?? null,
      bonusPercent: bonusPercent ?? null,
      pointsMultiplier: pointsMultiplier ?? null,
      pointsProgram,
      pointsValueCents: pointsValueCents ?? null,
      fixedDiscountDollars: fixedDiscountDollars ?? null,
      promoCreditDollars: promoCreditDollars ?? null,
      feeWaiverDollars: feeWaiverDollars ?? null,
      thresholdDollars: thresholdDollars ?? null,
      rewardDestination: rewardDestination as ParsedApproval["rewardDestination"],
      startDate: startDateRaw || null,
      expiryDate,
      expiryTime,
      expiryTimezone,
      isOngoing: input.ongoing,
      minSpend: minSpend ?? null,
      capDollars: capDollars ?? null,
      usesPerCustomer: usesPerCustomer ?? null,
      sourceUrl,
      termsUrl,
      promoCode: input.promoCode.trim() || null,
      australiaOnly,
      combinableWithSellerPromotions: combinable,
      membershipRequired: input.membershipRequired,
      activationRequired: input.activationRequired,
      couponRequired: input.couponRequired,
      shippingMayApply: input.shippingMayApply,
      targeted: input.targeted ?? false,
      sourceName,
      subOfferKey,
    },
  };
}
