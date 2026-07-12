import { describe, expect, it } from "vitest";
import {
  validateGiftCardApproval,
  type RawApprovalInput,
} from "@/lib/giftcards/approvalValidation";

/**
 * The approval validator is the material-field gate between the review form and
 * the approve RPC. These tests lock every Phase-13 safeguard shut and prove the
 * happy paths still pass, using the real production-data failure shapes.
 */

function base(overrides: Partial<RawApprovalInput> = {}): RawApprovalInput {
  return {
    brand: "Amazon",
    seller: "Amazon",
    promotionType: "discount",
    channel: "supermarket-promo",
    format: "unknown",
    discountPercent: "10",
    bonusPercent: "",
    pointsMultiplier: "",
    pointsProgram: "",
    pointsValueCents: "",
    fixedDiscountDollars: "",
    promoCreditDollars: "",
    feeWaiverDollars: "",
    thresholdDollars: "",
    rewardDestination: "checkout-discount",
    startDate: "",
    expiryDate: "2026-07-31",
    expiryTime: "",
    expiryTimezone: "",
    ongoing: false,
    minSpend: "",
    capDollars: "",
    usesPerCustomer: "",
    sourceUrl: "https://gcdb.com.au/offer/12680/",
    termsUrl: "",
    promoCode: "",
    australiaOnly: "",
    combinableWithSellerPromotions: "",
    membershipRequired: false,
    activationRequired: false,
    couponRequired: false,
    shippingMayApply: false,
    sourceName: "Gift Card Database",
    candidateRole: "single-offer",
    subOfferKey: "primary",
    sourcePresence: "present",
    ...overrides,
  };
}

const errorOf = (input: RawApprovalInput): string | null => {
  const r = validateGiftCardApproval(input);
  return r.ok ? null : r.error;
};

describe("happy path", () => {
  it("accepts a well-formed discount offer and separates seller from source", () => {
    const r = validateGiftCardApproval(
      base({ seller: "Amazon", sourceName: "Gift Card Database" })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.seller).toBe("Amazon");
      expect(r.values.brand).toBe("Amazon");
      expect(r.values.discountPercent).toBe(10);
      // seller is stored independently of the source name (kept separate).
      expect(r.values.seller).not.toBe("Gift Card Database");
    }
  });

  it("accepts an explicit ongoing offer with no expiry", () => {
    expect(errorOf(base({ expiryDate: "", ongoing: true }))).toBeNull();
  });

  it("accepts a valid points offer with a programme", () => {
    expect(
      errorOf(
        base({
          promotionType: "points",
          discountPercent: "",
          pointsMultiplier: "20",
          pointsProgram: "Everyday Rewards",
          rewardDestination: "loyalty-points",
        })
      )
    ).toBeNull();
  });
});

describe("required material fields", () => {
  it("blocks a missing brand", () => {
    expect(errorOf(base({ brand: "  " }))).toMatch(/brand/i);
  });
  it("blocks a missing seller", () => {
    expect(errorOf(base({ seller: "" }))).toMatch(/seller/i);
  });
  it("blocks a missing source URL", () => {
    expect(errorOf(base({ sourceUrl: "" }))).toMatch(/source url/i);
  });
  it("blocks a non-HTTPS source URL", () => {
    expect(errorOf(base({ sourceUrl: "http://x.test" }))).toMatch(/https/i);
  });
  it("blocks an unknown promotion type", () => {
    expect(errorOf(base({ promotionType: "mystery" }))).toMatch(/promotion type/i);
  });
  it("blocks a missing promotion type instead of defaulting to discount", () => {
    expect(errorOf(base({ promotionType: "" }))).toMatch(/promotion type/i);
  });
  it("blocks a missing stored source name", () => {
    expect(errorOf(base({ sourceName: "" }))).toMatch(/source name/i);
  });
  it("blocks a discount with no percentage (missing value)", () => {
    expect(errorOf(base({ discountPercent: "0" }))).toMatch(/percentage/i);
  });
  it("blocks a points offer missing its programme", () => {
    expect(
      errorOf(
        base({
          promotionType: "points",
          discountPercent: "",
          pointsMultiplier: "20",
          pointsProgram: "",
        })
      )
    ).toMatch(/programme/i);
  });
});

describe("expiry-or-ongoing", () => {
  it("blocks a missing expiry unless ongoing is ticked", () => {
    expect(errorOf(base({ expiryDate: "", ongoing: false }))).toMatch(/expiry date is required/i);
  });
  it("blocks an offer that is both dated and ongoing", () => {
    expect(errorOf(base({ expiryDate: "2026-07-31", ongoing: true }))).toMatch(/both/i);
  });
});

describe("compound-campaign safeguard", () => {
  const bigList = Array.from({ length: 12 }, (_, i) => `Brand ${i}`).join(", ");

  it("blocks a compound (many-brand) source when not confirmed as a single offer", () => {
    expect(errorOf(base({ brand: bigList }))).toMatch(/compound campaign/i);
  });

  it("cannot be overridden as a single broad offer", () => {
    expect(errorOf(base({ brand: bigList, candidateRole: "single-offer" }))).toMatch(
      /split/i
    );
  });

  it("does not block a small genuine bundle", () => {
    expect(
      errorOf(base({ brand: "TCN Love, TCN Shop, TCN Cinema, TCN Good Food" }))
    ).toBeNull();
  });

  it("blocks a server-identified compound summary even with a short brand list", () => {
    expect(
      errorOf(
        base({
          brand: "Apple, Uber",
          promotionType: "mixed",
          candidateRole: "compound-summary",
          parentIsCompound: true,
        })
      )
    ).toMatch(/cannot be published|split/i);
  });

  it("allows an atomic, stable child of a compound source", () => {
    expect(
      errorOf(
        base({
          brand: "Uber & Uber Eats",
          parentIsCompound: true,
          candidateRole: "suboffer",
          subOfferKey: "uber-discount",
        })
      )
    ).toBeNull();
  });

  it("blocks a sub-offer removed from the source", () => {
    expect(errorOf(base({ sourcePresence: "removed" }))).toMatch(/removed/i);
  });
});

describe("atomic promotion mechanics", () => {
  it("requires amount, threshold and seller-credit destination for promo credit", () => {
    const input = base({
      promotionType: "promo-credit",
      discountPercent: "",
      promoCreditDollars: "10",
      thresholdDollars: "100",
      rewardDestination: "seller-credit",
    });
    expect(errorOf(input)).toBeNull();
    expect(errorOf({ ...input, thresholdDollars: "" })).toMatch(/threshold/i);
    expect(errorOf({ ...input, rewardDestination: "checkout-discount" })).toMatch(
      /destination/i
    );
  });

  it("requires a threshold for fixed-dollar discounts", () => {
    expect(
      errorOf(
        base({
          promotionType: "fixed-dollar-discount",
          discountPercent: "",
          fixedDiscountDollars: "10",
          thresholdDollars: "",
        })
      )
    ).toMatch(/threshold/i);
  });

  it("allows a fee waiver only with the waived-fee destination", () => {
    expect(
      errorOf(
        base({
          promotionType: "fee-waiver",
          discountPercent: "",
          rewardDestination: "waived-fee",
        })
      )
    ).toBeNull();
  });
});

describe("membership-signal safeguard", () => {
  it("blocks a member-portal offer that omits the membership flag", () => {
    expect(
      errorOf(
        base({
          seller: "RACV Member Benefits portal",
          sourceName: "RACV Member Benefits",
          discountPercent: "5",
          membershipRequired: false,
        })
      )
    ).toMatch(/member-only|membership/i);
  });

  it("passes once membership required is set", () => {
    expect(
      errorOf(
        base({
          seller: "RACV Member Benefits portal",
          sourceName: "RACV Member Benefits",
          discountPercent: "5",
          membershipRequired: true,
        })
      )
    ).toBeNull();
  });

  it("does not fire for a plain retail seller", () => {
    expect(errorOf(base({ seller: "Amazon", sourceName: "Gift Card Database" }))).toBeNull();
  });
});

describe("spend-threshold safeguard", () => {
  it("blocks a threshold offer with no recorded minimum spend", () => {
    expect(
      errorOf(
        base({
          thresholdText: "Sample: 2,000 bonus Flybuys when you buy $100+ in Coles Group gift cards",
          minSpend: "",
        })
      )
    ).toMatch(/minimum spend/i);
  });

  it("passes once the minimum spend is recorded", () => {
    expect(
      errorOf(
        base({
          thresholdText: "2,000 bonus Flybuys when you buy $100+",
          minSpend: "100",
        })
      )
    ).toBeNull();
  });

  it("does not fire without a threshold in the text", () => {
    expect(errorOf(base({ thresholdText: "One use per customer", minSpend: "" }))).toBeNull();
  });
});
