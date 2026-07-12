import { describe, expect, it } from "vitest";
import {
  classifyProgrammeRateChange,
  type ProgrammeRateSnapshot,
} from "@/lib/giftcards/programmeRates";

const rate = (
  overrides: Partial<ProgrammeRateSnapshot> = {}
): ProgrammeRateSnapshot => ({
  isActive: true,
  promotionType: "discount",
  discountPercent: 3.5,
  fixedDiscountDollars: null,
  bonusPercent: null,
  feeWaiverDollars: null,
  thresholdDollars: null,
  paymentRequirement: "Pay from the linked bank account",
  membershipTier: null,
  ...overrides,
});

describe("programme catalogue rate history", () => {
  it("records products being added and removed", () => {
    expect(classifyProgrammeRateChange(null, rate())).toBe("product-added");
    expect(classifyProgrammeRateChange(rate(), null)).toBe("product-removed");
    expect(classifyProgrammeRateChange(rate(), rate({ isActive: false }))).toBe(
      "product-removed"
    );
  });

  it("distinguishes rate increases from decreases", () => {
    expect(
      classifyProgrammeRateChange(rate(), rate({ discountPercent: 4.5 }))
    ).toBe("rate-increased");
    expect(
      classifyProgrammeRateChange(rate(), rate({ discountPercent: 2 }))
    ).toBe("rate-decreased");
  });

  it("records eligibility/payment changes without inventing a rate change", () => {
    expect(
      classifyProgrammeRateChange(
        rate(),
        rate({ paymentRequirement: "Eligible debit card only" })
      )
    ).toBe("terms-changed");
  });
});
