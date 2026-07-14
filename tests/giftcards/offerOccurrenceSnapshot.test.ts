import { describe, expect, it } from "vitest";
import { buildOfferOccurrenceSnapshot, type ExpiredGiftCardOfferForHistory } from "@/lib/giftcards/offerOccurrenceSnapshot";

const base = (over: Partial<ExpiredGiftCardOfferForHistory> = {}): ExpiredGiftCardOfferForHistory => ({
  id: "gc-apple-coles",
  brand: "Apple",
  productId: "apple-gift-card",
  seller: "Coles",
  promotionType: "points",
  discountPercent: null,
  fixedDiscountDollars: null,
  promoCreditDollars: null,
  feeWaiverDollars: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgramme: "Flybuys",
  thresholdDollars: null,
  startDate: "2026-07-01",
  endDate: "2026-07-07",
  sourceUrl: "https://example.com/apple-offer",
  verifiedAt: "2026-07-01T02:00:00Z",
  ...over,
});

describe("public gift-card occurrence snapshots", () => {
  it("creates a bounded structured snapshot for an expired atomic offer", () => {
    expect(buildOfferOccurrenceSnapshot(base(), "2026-07-13")).toMatchObject({
      source_offer_id: "gc-apple-coles",
      seller_key: "coles",
      product_key: "apple-gift-card",
      promotion_type: "points",
      points_multiplier: 20,
      points_programme: "Flybuys",
      discount_percent: null,
    });
  });

  it("seals a fixed-points occurrence without inventing a multiplier", () => {
    const snapshot = buildOfferOccurrenceSnapshot(
      base({ pointsMultiplier: null, fixedPoints: 2000 }),
      "2026-07-13",
    );
    expect(snapshot.points_multiplier).toBeNull();
    expect(snapshot.fixed_points).toBe(2000);
  });

  it("rejects a mixed fixed-points and multiplier occurrence", () => {
    expect(() =>
      buildOfferOccurrenceSnapshot(base({ fixedPoints: 2000 }), "2026-07-13"),
    ).toThrow(/structured value/i);
  });

  it("blocks current, sourceless and non-atomic offers", () => {
    expect(() => buildOfferOccurrenceSnapshot(base({ endDate: "2026-07-13" }), "2026-07-13")).toThrow(/Only expired/);
    expect(() => buildOfferOccurrenceSnapshot(base({ sourceUrl: null }), "2026-07-13")).toThrow(/HTTPS source/);
    expect(() => buildOfferOccurrenceSnapshot(base({ promotionType: "mixed" }), "2026-07-13")).toThrow(/atomic/);
  });

  it("requires a threshold for fixed-dollar and promo-credit history", () => {
    expect(() => buildOfferOccurrenceSnapshot(base({ promotionType: "promo-credit", pointsMultiplier: null, pointsProgramme: null, promoCreditDollars: 10 }), "2026-07-13")).toThrow(/structured value/);
    expect(buildOfferOccurrenceSnapshot(base({ promotionType: "promo-credit", pointsMultiplier: null, pointsProgramme: null, promoCreditDollars: 10, thresholdDollars: 100 }), "2026-07-13").fixed_dollars).toBe(10);
  });
});
