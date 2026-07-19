import { describe, expect, it } from "vitest";
import type { StackRecommendation } from "@/lib/offers/types";
import { summariseStackOutcome } from "@/lib/stack/outcome";

describe("homepage stack outcome", () => {
  it("separates checkout, gift-card outlay, later cashback and points", () => {
    const recommendation: StackRecommendation = {
      merchantId: "myer",
      merchantName: "Myer",
      title: "Myer stack",
      kind: "cash",
      basePrice: 500,
      components: [
        { layer: "discount", label: "10% code", valueDollars: 50, optional: false, citation: { source: "manual", sourceUrl: "/" }, confidence: "confirmed" },
        { layer: "gift-card", label: "4% gift card", valueDollars: 18, optional: true, citation: { source: "manual", sourceUrl: "/" }, confidence: "confirmed" },
        { layer: "cashback", label: "6% cashback", valueDollars: 27, optional: false, citation: { source: "manual", sourceUrl: "/" }, confidence: "confirmed" },
        { layer: "points", label: "Points", pointsEarned: 900, valueDollars: 4.5, optional: false, citation: { source: "manual", sourceUrl: "/" }, confidence: "confirmed" },
      ],
      effectivePrice: 423,
      payAtCheckout: 450,
      cashbackLater: 27,
      effectiveDiscountPercent: 15.4,
      totalSaving: 77,
      verifiedSaving: 77,
      checkedAsOf: "2026-07-12T01:00:00Z",
      soonestExpiry: null,
      pointsEarned: 900,
      pointsValueDollars: 4.5,
      confidence: "confirmed",
      warnings: [],
      citations: [],
      weekOf: "2026-07-06",
    };

    expect(summariseStackOutcome(recommendation)).toEqual({
      originalCart: 500,
      checkoutCost: 450,
      giftCardSaving: 0,
      cashbackLater: 27,
      cashPaidForCheckout: 450,
      effectiveFinalCost: 423,
      pointsEarned: 900,
      pointsValueDollars: 4.5,
    });
  });
});
