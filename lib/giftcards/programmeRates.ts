/** Pure change classifier for programme/catalogue rate history. */

export interface ProgrammeRateSnapshot {
  isActive: boolean;
  promotionType: string;
  discountPercent: number | null;
  fixedDiscountDollars: number | null;
  bonusPercent: number | null;
  feeWaiverDollars: number | null;
  thresholdDollars: number | null;
  paymentRequirement: string | null;
  membershipTier: string | null;
}

export type ProgrammeRateChange =
  | "product-added"
  | "product-removed"
  | "rate-increased"
  | "rate-decreased"
  | "terms-changed"
  | "unchanged";

function comparableValue(rate: ProgrammeRateSnapshot): number | null {
  if (rate.promotionType === "discount") return rate.discountPercent;
  if (rate.promotionType === "bonus-value") return rate.bonusPercent;
  if (rate.promotionType === "fixed-dollar-discount") {
    return rate.fixedDiscountDollars && rate.thresholdDollars
      ? (rate.fixedDiscountDollars / rate.thresholdDollars) * 100
      : null;
  }
  if (rate.promotionType === "fee-waiver") return rate.feeWaiverDollars;
  return null;
}

export function classifyProgrammeRateChange(
  before: ProgrammeRateSnapshot | null,
  after: ProgrammeRateSnapshot | null
): ProgrammeRateChange {
  if (!before && after?.isActive) return "product-added";
  if (before?.isActive && (!after || !after.isActive)) return "product-removed";
  if (!before || !after) return "unchanged";

  const oldValue = comparableValue(before);
  const newValue = comparableValue(after);
  if (oldValue != null && newValue != null && oldValue !== newValue) {
    return newValue > oldValue ? "rate-increased" : "rate-decreased";
  }
  if (
    before.promotionType !== after.promotionType ||
    before.paymentRequirement !== after.paymentRequirement ||
    before.membershipTier !== after.membershipTier ||
    before.thresholdDollars !== after.thresholdDollars
  ) {
    return "terms-changed";
  }
  return "unchanged";
}
