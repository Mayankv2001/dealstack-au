import type { ExtractedOffer } from "./extractOffer";

/**
 * Change classification between two extractions of the SAME source item —
 * decides whether a re-ingested item is cosmetic noise or a material change
 * that must send an approved offer back to review. Pure and exhaustive.
 */

export type ChangeKind =
  | "cosmetic"
  | "factual-non-material"
  | "material-offer"
  | "expiry-extension"
  | "eligibility"
  | "stacking-condition"
  | "source-removed";

export interface ChangeClassification {
  kind: ChangeKind;
  /** True when an approved offer based on `before` must be re-reviewed. */
  requiresReview: boolean;
  changedFields: string[];
}

function numChanged(a: number | null, b: number | null): boolean {
  return (a ?? null) !== (b ?? null);
}

export function classifyOfferChange(
  before: ExtractedOffer,
  after: ExtractedOffer | null
): ChangeClassification {
  if (after === null) {
    return {
      kind: "source-removed",
      requiresReview: true,
      changedFields: ["source"],
    };
  }

  const changed: string[] = [];
  if (numChanged(before.discountPercent, after.discountPercent)) changed.push("discountPercent");
  if (numChanged(before.bonusPercent, after.bonusPercent)) changed.push("bonusPercent");
  if (numChanged(before.pointsMultiplier, after.pointsMultiplier)) changed.push("pointsMultiplier");
  if (before.pointsProgram !== after.pointsProgram) changed.push("pointsProgram");
  if (before.promotionType !== after.promotionType) changed.push("promotionType");
  if (before.sellerName !== after.sellerName) changed.push("sellerName");
  if (before.startsAt !== after.startsAt) changed.push("startsAt");
  if (before.expiresAt !== after.expiresAt) changed.push("expiresAt");
  if (before.membershipRequired !== after.membershipRequired) changed.push("membershipRequired");
  if (before.activationRequired !== after.activationRequired) changed.push("activationRequired");
  if (before.couponRequired !== after.couponRequired) changed.push("couponRequired");
  if (numChanged(before.minSpend, after.minSpend)) changed.push("minSpend");
  const brandsBefore = [...before.giftCardBrands].sort().join("|");
  const brandsAfter = [...after.giftCardBrands].sort().join("|");
  if (brandsBefore !== brandsAfter) changed.push("giftCardBrands");

  // Value/seller/type changes are material — the promotion itself changed.
  const material = ["discountPercent", "bonusPercent", "pointsMultiplier",
    "pointsProgram", "promotionType", "sellerName"];
  if (changed.some((f) => material.includes(f))) {
    return { kind: "material-offer", requiresReview: true, changedFields: changed };
  }

  // Stacking-relevant conditions.
  const stacking = ["membershipRequired", "activationRequired", "couponRequired", "minSpend"];
  if (changed.some((f) => stacking.includes(f))) {
    return { kind: "stacking-condition", requiresReview: true, changedFields: changed };
  }

  // Which cards/merchants the offer covers.
  if (changed.includes("giftCardBrands")) {
    return { kind: "eligibility", requiresReview: true, changedFields: changed };
  }

  // A LATER expiry is an extension (review to confirm, but the live offer
  // stays valid); an earlier/removed expiry is material — it may already
  // have ended.
  if (changed.includes("expiresAt")) {
    const extended =
      before.expiresAt != null &&
      after.expiresAt != null &&
      after.expiresAt > before.expiresAt;
    return extended
      ? { kind: "expiry-extension", requiresReview: true, changedFields: changed }
      : { kind: "material-offer", requiresReview: true, changedFields: changed };
  }

  if (changed.includes("startsAt")) {
    return {
      kind: "factual-non-material",
      requiresReview: false,
      changedFields: changed,
    };
  }

  return { kind: "cosmetic", requiresReview: false, changedFields: changed };
}
