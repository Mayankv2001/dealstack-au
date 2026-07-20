import { describe, expect, it } from "vitest";
import {
  hasPublicOfferValue,
  inferPromotionType,
  promotionValueGap,
} from "@/lib/giftcards/valueReadiness";

/**
 * The promotion-specific value rule shared by the publish gate and the public
 * read boundary: an offer must carry the data its own mechanic promises. A
 * title + seller + dates alone is NOT an offer. Data presence, not valuation —
 * a fixed-points award in an unpriceable programme still passes.
 */

describe("promotionValueGap — declared mechanics", () => {
  it("rejects a discount with no percentage (the Coles Group corruption shape)", () => {
    expect(
      promotionValueGap({ promotionType: "discount", discountPercent: 0 }),
    ).toMatch(/percentage discount needs a positive value/i);
    expect(
      promotionValueGap({ promotionType: "discount", discountPercent: null }),
    ).toBeTruthy();
  });

  it("accepts a discount with a positive percentage", () => {
    expect(
      promotionValueGap({ promotionType: "discount", discountPercent: 10 }),
    ).toBeNull();
  });

  it("rejects a points offer with neither multiplier nor fixed award", () => {
    expect(
      promotionValueGap({
        promotionType: "points",
        pointsProgram: "Flybuys",
      }),
    ).toMatch(/multiplier or a fixed points award/i);
  });

  it("accepts a fixed-points offer with a programme — no valuation required", () => {
    expect(
      promotionValueGap({
        promotionType: "points",
        fixedPoints: 1000,
        pointsProgram: "Flybuys",
      }),
    ).toBeNull();
    // Unpriceable programme: still real, useful facts.
    expect(
      promotionValueGap({
        promotionType: "points",
        fixedPoints: 500,
        pointsProgram: "Mystery Rewards",
      }),
    ).toBeNull();
  });

  it("accepts a multiplier offer with a programme", () => {
    expect(
      promotionValueGap({
        promotionType: "points",
        pointsMultiplier: 10,
        pointsProgram: "Everyday Rewards",
      }),
    ).toBeNull();
  });

  it("rejects a points offer without its programme", () => {
    expect(
      promotionValueGap({ promotionType: "points", fixedPoints: 1000 }),
    ).toMatch(/programme/i);
  });

  it("rejects contradictory points mechanics (multiplier AND fixed award)", () => {
    expect(
      promotionValueGap({
        promotionType: "points",
        pointsMultiplier: 10,
        fixedPoints: 1000,
        pointsProgram: "Flybuys",
      }),
    ).toMatch(/cannot carry both/i);
  });

  it("rejects contradictory dates (expiry AND ongoing)", () => {
    expect(
      promotionValueGap({
        promotionType: "discount",
        discountPercent: 10,
        expiryDate: "2026-09-30",
        isOngoing: true,
      }),
    ).toMatch(/expiry date and ongoing/i);
  });

  it("rejects compound summaries and unknown mechanics", () => {
    expect(promotionValueGap({ promotionType: "mixed" })).toMatch(/split/i);
    expect(promotionValueGap({ promotionType: "surprise" })).toMatch(
      /known atomic promotion type/i,
    );
  });

  it("keeps fee-waiver publishable without a stated amount", () => {
    expect(promotionValueGap({ promotionType: "fee-waiver" })).toBeNull();
  });

  it("requires amount + threshold for fixed-dollar and promo-credit offers", () => {
    expect(
      promotionValueGap({
        promotionType: "fixed-dollar-discount",
        fixedDiscountDollars: 10,
      }),
    ).toBeTruthy();
    expect(
      promotionValueGap({
        promotionType: "promo-credit",
        promoCreditDollars: 10,
        thresholdDollars: 50,
      }),
    ).toBeNull();
  });
});

describe("promotionValueGap — legacy rows without a declared mechanic", () => {
  it("infers a discount from a positive percentage", () => {
    expect(inferPromotionType({ discountPercent: 5 })).toBe("discount");
    expect(promotionValueGap({ discountPercent: 5 })).toBeNull();
  });

  it("fails a legacy row whose only content is prose (no structured value)", () => {
    // The exact shape of the corrupted public record: discountPercent 0 and a
    // points earnNote living in prose, no structured fields at all.
    expect(inferPromotionType({ discountPercent: 0 })).toBeNull();
    expect(promotionValueGap({ discountPercent: 0 })).toMatch(
      /no promotion-specific value data/i,
    );
    expect(hasPublicOfferValue({ discountPercent: 0 })).toBe(false);
  });

  it("infers points from structured fixed points with a programme", () => {
    expect(
      hasPublicOfferValue({
        discountPercent: 0,
        fixedPoints: 2000,
        pointsProgram: "Flybuys",
      }),
    ).toBe(true);
  });
});
