import { describe, expect, it } from "vitest";
import { extractOffer } from "@/lib/giftcards/extractOffer";
import type { GcdbFeedItem } from "@/lib/giftcards/parseGcdbFeed";

/**
 * Candidate extraction: one parsed feed item → normalised fields + confidence +
 * explicit warnings. The extractor must never invent rates/dates/programmes;
 * unknowns stay null and lower confidence. Output is staged for admin review.
 */

function item(overrides: Partial<GcdbFeedItem> = {}): GcdbFeedItem {
  return {
    externalId: "1",
    canonicalUrl: "https://gcdb.com.au/offer/1/",
    title: "",
    publishedAt: null,
    offerType: null,
    sellerName: null,
    giftCardBrands: [],
    startsAt: null,
    endsAt: null,
    excerpt: "",
    ...overrides,
  };
}

describe("extractOffer — discount", () => {
  const result = extractOffer(
    item({
      title: "10% off Coles Group gift cards",
      offerType: "discount",
      sellerName: "Coles",
      giftCardBrands: ["Coles Group"],
      endsAt: "2026-07-17",
      excerpt: "Get 10% off. Ends 17 Jul 2026.",
    })
  );

  it("reads the discount percentage and classification", () => {
    expect(result.promotionType).toBe("discount");
    expect(result.discountPercent).toBe(10);
    expect(result.bonusPercent).toBeNull();
    expect(result.effectiveDiscountPercent).toBe(10);
  });

  it("scores full confidence with no warnings when every field is present", () => {
    expect(result.confidence).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});

describe("extractOffer — bonus value is not read as a discount", () => {
  const result = extractOffer(
    item({
      title: "10% bonus value on Ultimate gift cards",
      sellerName: "Card.Gift",
      giftCardBrands: ["Ultimate"],
    })
  );

  it("classifies as bonus-value and uses the net-cost formula", () => {
    expect(result.promotionType).toBe("bonus-value");
    expect(result.bonusPercent).toBe(10);
    expect(result.discountPercent).toBeNull();
    expect(result.effectiveDiscountPercent).toBe(9.09);
  });

  it("warns about the missing end date", () => {
    expect(result.warnings).toContain("No end date found — confirm at the source.");
  });
});

describe("extractOffer — points", () => {
  const result = extractOffer(
    item({
      title: "20x Everyday Rewards points on Coles Mastercard gift cards",
      offerType: "points",
      sellerName: "Coles",
      giftCardBrands: ["Coles Mastercard"],
      endsAt: "2026-08-01",
    })
  );

  it("reads the multiplier and resolves the programme", () => {
    expect(result.promotionType).toBe("points");
    expect(result.pointsMultiplier).toBe(20);
    expect(result.pointsProgram).toBe("Everyday Rewards");
    expect(result.effectiveDiscountPercent).toBe(9.09);
  });
});

describe("extractOffer — reconciliation warnings", () => {
  it("warns when classified as a discount but no percentage is present", () => {
    const result = extractOffer(
      item({
        title: "Discount on Coles gift cards this week",
        offerType: "discount",
        sellerName: "Coles",
        giftCardBrands: ["Coles Group"],
        endsAt: "2026-07-20",
      })
    );
    expect(result.discountPercent).toBeNull();
    expect(result.warnings).toContain(
      "Classified as a discount but no percentage was found."
    );
    expect(result.warnings).toContain("No promotion value could be extracted.");
  });

  it("warns when a points multiplier is found but the programme is unclear", () => {
    const result = extractOffer(
      item({
        title: "15x points on selected gift cards",
        offerType: "points",
        sellerName: "Shop",
        giftCardBrands: ["Selected"],
        endsAt: "2026-07-20",
      })
    );
    expect(result.pointsMultiplier).toBe(15);
    expect(result.pointsProgram).toBeNull();
    expect(result.warnings).toContain(
      "Points multiplier found but the programme is unclear."
    );
  });
});

describe("extractOffer — conditions", () => {
  it("detects membership, activation, coupon, min spend and a limit note", () => {
    const result = extractOffer(
      item({
        title:
          "RACV members: 5% off gift cards, activate the boosted offer, use code SAVE, min spend $50, limit 5 per customer",
        sellerName: "RACV",
        giftCardBrands: ["Ultimate"],
        endsAt: "2026-07-31",
      })
    );
    expect(result.membershipRequired).toBe(true);
    expect(result.activationRequired).toBe(true);
    expect(result.couponRequired).toBe(true);
    expect(result.minSpend).toBe(50);
    expect(result.purchaseLimitNote).toContain("limit 5 per customer");
    // A concrete discount still wins the type over the membership signal.
    expect(result.promotionType).toBe("discount");
    expect(result.discountPercent).toBe(5);
  });

  it("falls back to a membership type when nothing else is quantifiable", () => {
    const result = extractOffer(
      item({
        title: "Members save on gift cards at the benefits portal",
        sellerName: "Union Shopper",
        giftCardBrands: ["Ultimate"],
      })
    );
    expect(result.membershipRequired).toBe(true);
    expect(result.promotionType).toBe("membership");
    expect(result.effectiveDiscountPercent).toBeNull();
  });

  it("lowers confidence and warns when seller, brand and value are all absent", () => {
    const result = extractOffer(item({ title: "A gift card offer" }));
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.warnings).toContain("No seller found in the source item.");
    expect(result.warnings).toContain("No gift-card brand found in the source item.");
  });
});
