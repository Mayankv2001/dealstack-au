import { describe, expect, it } from "vitest";
import { makeOffer } from "./offerFixture";
import {
  buildWeeklyPurchasePlan,
  queryWeeklyOffers,
  weeklyAttribution,
  weeklyOfferIsActive,
  weeklyPlanHref,
} from "@/lib/giftcards/weeklyOffers";

const now = new Date("2026-07-17T01:00:00Z");
const weekly = makeOffer({
  id: "weekly-apple",
  brand: "Apple",
  channel: "supermarket-promo",
  purchaseLocation: "Woolworths",
  startDate: "2026-07-15",
  expiryDate: "2026-07-21",
  promotionType: "points",
  discountPercent: 0,
  pointsMultiplier: 20,
  pointsProgram: "Everyday Rewards",
  confidence: "confirmed",
  denominationNote: "$20–$500 variable load",
  limitPerCustomer: "Limit 2 per day",
  acceptedAtMerchantIds: ["apple"],
  sourceDetailUrl:
    "https://www.pointhacks.com.au/weekly-gift-card-offers/",
  termsUrl: "https://www.woolworths.com.au/shop/catalogue",
  citations: [
    {
      source: "pointhacks",
      sourceUrl:
        "https://www.pointhacks.com.au/weekly-gift-card-offers/",
    },
    {
      source: "gcdb",
      sourceUrl: "https://gcdb.com.au/offer/weekly-apple/",
    },
  ],
});

describe("weekly offer activation and filtering", () => {
  it("does not activate before the confirmed start and expires after the end", () => {
    expect(weeklyOfferIsActive(weekly, new Date("2026-07-14T01:00:00Z"))).toBe(false);
    expect(weeklyOfferIsActive(weekly, now)).toBe(true);
    expect(weeklyOfferIsActive(weekly, new Date("2026-07-22T01:00:00Z"))).toBe(false);
  });

  it("filters approved inputs by seller and programme without changing publication state", () => {
    expect(queryWeeklyOffers([weekly], "woolworths", now)).toHaveLength(1);
    expect(queryWeeklyOffers([weekly], "everyday-rewards", now)).toHaveLength(1);
    expect(queryWeeklyOffers([weekly], "coles", now)).toHaveLength(0);
  });
});

describe("weekly attribution", () => {
  it("separates retailer evidence, specialist discovery, corroboration and review", () => {
    expect(weeklyAttribution(weekly)).toEqual({
      retailerEvidenceUrl: "https://www.woolworths.com.au/shop/catalogue",
      discoverySource: {
        name: "Point Hacks",
        url: "https://www.pointhacks.com.au/weekly-gift-card-offers/",
      },
      corroboration: [
        {
          name: "gcdb",
          url: "https://gcdb.com.au/offer/weekly-apple/",
        },
      ],
      reviewStatus: "DealStack verification completed",
    });
  });
});

describe("weekly purchase planner", () => {
  it("calculates variable-load quantity, points and shopping days without reducing cash paid", () => {
    const plan = buildWeeklyPurchasePlan(weekly, 1200);
    expect(plan.cardMix).toEqual([
      { denomination: 500, count: 2 },
      { denomination: 200, count: 1 },
    ]);
    expect(plan.requiredCardQuantity).toBe(3);
    expect(plan.shoppingDays).toBe(2);
    expect(plan.cashPaid).toBe(1200);
    expect(plan.immediateCashSaving).toBe(0);
    expect(plan.pointsEarned).toBe(24000);
    expect(plan.estimatedRewardsValue).toBe(120);
    expect(plan.redemptionMerchantId).toBe("apple");
  });

  it("preserves a remainder below the minimum variable load", () => {
    const plan = buildWeeklyPurchasePlan(weekly, 510);
    expect(plan.cardMix).toEqual([
      { denomination: 490, count: 1 },
      { denomination: 20, count: 1 },
    ]);
    expect(plan.cashPaid).toBe(510);
    expect(plan.unusedGiftCardBalance).toBe(0);
  });

  it("keeps bonus card value separate from cash paid", () => {
    const plan = buildWeeklyPurchasePlan(
      makeOffer({
        ...weekly,
        id: "weekly-myer",
        brand: "Myer",
        purchaseLocation: "Coles",
        promotionType: "bonus-value",
        bonusPercent: 10,
        pointsMultiplier: null,
        pointsProgram: null,
        denominationNote: "$100 gift card",
        acceptedAtMerchantIds: [],
      }),
      100,
    );
    expect(plan.cashPaid).toBe(100);
    expect(plan.immediateCashSaving).toBe(0);
    expect(plan.bonusCardValue).toBe(10);
    expect(plan.redemptionMerchantId).toBeNull();
    expect(plan.warnings).toContain(
      "A single redemption merchant cannot be determined from approved evidence.",
    );
  });

  it("finds a fixed-denomination mix and reports unused balance", () => {
    const plan = buildWeeklyPurchasePlan(
      makeOffer({
        ...weekly,
        denominationNote: "$50 and $100 cards",
        pointsMultiplier: 10,
      }),
      125,
    );
    expect(plan.cardMix).toEqual([
      { denomination: 100, count: 1 },
      { denomination: 50, count: 1 },
    ]);
    expect(plan.unusedGiftCardBalance).toBe(25);
  });

  it("keeps a fixed points award constant and separate from cash paid", () => {
    const plan = buildWeeklyPurchasePlan(
      makeOffer({
        ...weekly,
        pointsMultiplier: null,
        fixedPoints: 2000,
        pointsProgram: "Flybuys",
        denominationNote: "$100 gift card",
      }),
      100,
    );
    expect(plan.cashPaid).toBe(100);
    expect(plan.immediateCashSaving).toBe(0);
    expect(plan.pointsEarned).toBe(2000);
    expect(plan.estimatedRewardsValue).toBe(10);
  });

  it("creates an explicit shareable planner prefill", () => {
    expect(weeklyPlanHref(weekly, 750)).toBe(
      "/gift-cards/weekly/plan?offer=weekly-apple&spend=750",
    );
  });
});
