import { describe, expect, it } from "vitest";
import {
  giftCardPublishError,
  type GiftCardPublishFacts,
} from "@/lib/giftcards/publishReadiness";

const facts = (
  overrides: Partial<GiftCardPublishFacts> = {}
): GiftCardPublishFacts => ({
  brand: "Apple",
  seller: "Big W",
  sourceUrl: "https://gcdb.com.au/offer/12783/",
  promotionType: "discount",
  discountPercent: 10,
  bonusPercent: null,
  pointsMultiplier: null,
  fixedPoints: null,
  pointsProgram: null,
  fixedDiscountDollars: null,
  promoCreditDollars: null,
  thresholdDollars: null,
  membershipRequired: false,
  expiryDate: "2026-07-15",
  isOngoing: false,
  ...overrides,
});

describe("manual gift-card publish readiness", () => {
  it("blocks missing seller, source, value and date", () => {
    expect(giftCardPublishError(facts({ seller: null }))).toMatch(/seller/i);
    expect(giftCardPublishError(facts({ sourceUrl: null }))).toMatch(/source url/i);
    expect(giftCardPublishError(facts({ discountPercent: 0 }))).toMatch(/value/i);
    expect(giftCardPublishError(facts({ expiryDate: null }))).toMatch(/expiry/i);
  });

  it("requires a threshold for fixed discounts and promo credits", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "promo-credit",
          discountPercent: 0,
          promoCreditDollars: 10,
          thresholdDollars: null,
        })
      )
    ).toMatch(/threshold/i);
  });

  it("allows an explicitly ongoing reviewed membership rate", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "membership",
          discountPercent: 5,
          membershipRequired: true,
          expiryDate: null,
          isOngoing: true,
        })
      )
    ).toBeNull();
  });
});

describe("publish readiness — points mechanics", () => {
  it("keeps a valid fixed-points offer publishable", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "points",
          discountPercent: null,
          fixedPoints: 1000,
          pointsProgram: "Flybuys",
        }),
      ),
    ).toBeNull();
  });

  it("keeps a valid multiplier offer publishable", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "points",
          discountPercent: null,
          pointsMultiplier: 10,
          pointsProgram: "Everyday Rewards",
        }),
      ),
    ).toBeNull();
  });

  it("blocks a points offer with neither multiplier nor fixed points", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "points",
          discountPercent: null,
          pointsProgram: "Flybuys",
        }),
      ),
    ).toMatch(/multiplier or a fixed points award/i);
  });

  it("blocks contradictory multiplier + fixed points", () => {
    expect(
      giftCardPublishError(
        facts({
          promotionType: "points",
          discountPercent: null,
          pointsMultiplier: 10,
          fixedPoints: 1000,
          pointsProgram: "Flybuys",
        }),
      ),
    ).toMatch(/cannot carry both/i);
  });

  it("blocks a row with no declared promotion type — never defaults to discount", () => {
    expect(giftCardPublishError(facts({ promotionType: null }))).toMatch(
      /known atomic promotion type/i,
    );
  });
});
