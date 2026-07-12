import { describe, expect, it } from "vitest";
import {
  acquisitionForSpend,
  bonusEffectiveDiscountPercent,
  defaultPointValueCents,
  effectiveDiscountPercent,
  valuePointsOffer,
} from "@/lib/giftcards/value";

/**
 * The shared valuation arithmetic — the ONE place these formulas live, so the
 * offer card, detail page, admin preview and stack engine all agree. These
 * tests pin the disclosed formulas exactly (see lib/giftcards/value.ts).
 */

describe("bonusEffectiveDiscountPercent", () => {
  it("converts 10% bonus value to a 9.09% effective discount", () => {
    // $110 spending power for $100 cash → 10/110.
    expect(bonusEffectiveDiscountPercent(10)).toBe(9.09);
  });

  it("converts 25% bonus value to 20%", () => {
    expect(bonusEffectiveDiscountPercent(25)).toBe(20);
  });

  it("returns 0 for non-positive or non-finite input", () => {
    expect(bonusEffectiveDiscountPercent(0)).toBe(0);
    expect(bonusEffectiveDiscountPercent(-5)).toBe(0);
    expect(bonusEffectiveDiscountPercent(Number.NaN)).toBe(0);
  });
});

describe("defaultPointValueCents", () => {
  it("resolves known programmes case-insensitively via substring", () => {
    expect(defaultPointValueCents("Everyday Rewards")).toBe(0.5);
    expect(defaultPointValueCents("flybuys")).toBe(0.5);
    expect(defaultPointValueCents("Qantas Frequent Flyer")).toBe(1);
    expect(defaultPointValueCents("Velocity")).toBe(1);
  });

  it("returns null for unknown or missing programmes (never guesses)", () => {
    expect(defaultPointValueCents("Woolworths Mystery Points")).toBeNull();
    expect(defaultPointValueCents(null)).toBeNull();
    expect(defaultPointValueCents("")).toBeNull();
  });
});

describe("valuePointsOffer", () => {
  it("values 20x Everyday Rewards on a $100 card at the disclosed 0.5c", () => {
    const v = valuePointsOffer(20, 100, "Everyday Rewards");
    expect(v).not.toBeNull();
    expect(v?.points).toBe(2000);
    expect(v?.valueDollars).toBe(10);
    expect(v?.pointValueCents).toBe(0.5);
    expect(v?.effectiveDiscountPercent).toBe(9.09);
    expect(v?.effectiveCostDollars).toBe(90);
  });

  it("honours a per-offer cents-per-point override over the default", () => {
    const v = valuePointsOffer(20, 100, "Everyday Rewards", 1);
    expect(v?.valueDollars).toBe(20);
    expect(v?.effectiveDiscountPercent).toBe(16.67);
  });

  it("returns null when the multiplier is unusable", () => {
    expect(valuePointsOffer(null, 100, "Qantas")).toBeNull();
    expect(valuePointsOffer(0, 100, "Qantas")).toBeNull();
    expect(valuePointsOffer(-3, 100, "Qantas")).toBeNull();
  });

  it("returns null when no point valuation is available (unknown programme)", () => {
    expect(valuePointsOffer(20, 100, "Unknown Program")).toBeNull();
  });

  it("returns null for a non-positive face value", () => {
    expect(valuePointsOffer(20, 0, "Qantas")).toBeNull();
  });
});

describe("effectiveDiscountPercent (the single saving figure)", () => {
  it("returns the direct discount as-is when present", () => {
    expect(
      effectiveDiscountPercent({
        promotionType: "discount",
        discountPercent: 12,
        bonusPercent: null,
        pointsMultiplier: null,
        pointsProgram: null,
      })
    ).toBe(12);
  });

  it("uses the bonus-value formula for bonus offers", () => {
    expect(
      effectiveDiscountPercent({
        promotionType: "bonus-value",
        discountPercent: null,
        bonusPercent: 10,
        pointsMultiplier: null,
        pointsProgram: null,
      })
    ).toBe(9.09);
  });

  it("uses the points formula when a programme can be valued", () => {
    expect(
      effectiveDiscountPercent({
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      })
    ).toBe(9.09);
  });

  it("returns null when nothing can be valued honestly", () => {
    expect(
      effectiveDiscountPercent({
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 20,
        pointsProgram: null,
      })
    ).toBeNull();
    expect(
      effectiveDiscountPercent({
        promotionType: "membership",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: null,
        pointsProgram: null,
      })
    ).toBeNull();
  });

  it("prefers a direct discount over bonus/points when several are set", () => {
    expect(
      effectiveDiscountPercent({
        promotionType: "discount",
        discountPercent: 8,
        bonusPercent: 10,
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      })
    ).toBe(8);
  });
});

describe("acquisitionForSpend", () => {
  it("buys exactly the spend at the discount when uncapped", () => {
    expect(acquisitionForSpend(500, 10)).toEqual({
      faceValue: 500,
      cashPaid: 450,
      saving: 50,
    });
  });

  it("caps face value bought at the per-order cap; caller pays the rest", () => {
    expect(acquisitionForSpend(500, 10, 250)).toEqual({
      faceValue: 250,
      cashPaid: 225,
      saving: 25,
    });
  });

  it("leaves face at the spend when denominations alone cover it", () => {
    // $250 spend, $100 denom, no count limit: min() clamps to the spend, so
    // denominations only bite once a purchase-count limit is also present.
    expect(acquisitionForSpend(250, 10, null, 100)).toEqual({
      faceValue: 250,
      cashPaid: 225,
      saving: 25,
    });
  });

  it("honours a purchase-count limit against the denomination", () => {
    // $250 spend, $100 denom, limit 2 cards → $200 face covered.
    expect(acquisitionForSpend(250, 10, null, 100, 2)).toEqual({
      faceValue: 200,
      cashPaid: 180,
      saving: 20,
    });
  });

  it("returns zeros for non-positive spend or discount", () => {
    expect(acquisitionForSpend(0, 10)).toEqual({ faceValue: 0, cashPaid: 0, saving: 0 });
    expect(acquisitionForSpend(500, 0)).toEqual({ faceValue: 0, cashPaid: 0, saving: 0 });
  });
});
