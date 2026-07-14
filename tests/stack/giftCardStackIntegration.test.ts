import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "../../lib/stack/buildStack";
import {
  TEST_NOW,
  makeGiftCardAcceptance,
  makeGiftCard,
  makeGiftCardProduct,
  makeStackData,
  makeStore,
} from "./factories";

/**
 * Focused coverage for the migration-021 gift-card integration into the stack
 * engine: points and bonus value never reduce immediate cash price,
 * action-gated cards are optional and never deducted from the guaranteed
 * price, and every surfaced gift-card layer carries the same two-stage
 * compatibility verdict used on offer detail pages.
 */

describe("stack integration — bonus-value gift cards", () => {
  it("never presents bonus spending power as an immediate cash discount", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "myer", discountPercent: 10, discountCode: "SAVE10" }),
      ],
      giftCardOffers: [
        makeGiftCard({
          discountPercent: 0,
          promotionType: "bonus-value",
          bonusPercent: 10,
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.effectivePrice).toBe(450);
    expect(rec.totalSaving).toBe(50);
    expect(rec.components.some((component) => component.layer === "gift-card")).toBe(
      false
    );
  });
});

describe("stack integration — points gift cards", () => {
  it("values the points separately while leaving cash price unchanged", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer" })],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [makeGiftCard({
        productId: "product-1",
        acceptedAtMerchantIds: ["myer"],
        discountPercent: 0,
        promotionType: "points",
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const points = rec.components.find((component) => component.layer === "points");
    expect(rec.kind).toBe("points-only");
    expect(rec.effectivePrice).toBe(500);
    expect(rec.totalSaving).toBe(0);
    expect(rec.pointsEarned).toBe(10_000);
    expect(rec.pointsValueDollars).toBe(50);
    expect(points?.valueDollars).toBe(50);
    expect(points?.note).toMatch(/cash price is unchanged/i);
    expect(points?.compatibilityStatus).toBe("likely-compatible");
  });

  it("keeps a fixed points award constant and separate from cash paid", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer" })],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [makeGiftCard({
        productId: "product-1",
        acceptedAtMerchantIds: ["myer"],
        discountPercent: 0,
        promotionType: "points",
        pointsMultiplier: null,
        fixedPoints: 2000,
        pointsProgram: "Flybuys",
      })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.effectivePrice).toBe(500);
    expect(rec.totalSaving).toBe(0);
    expect(rec.pointsEarned).toBe(2000);
    expect(rec.pointsValueDollars).toBe(10);
    expect(
      rec.components.find((component) => component.layer === "points")?.label,
    ).toMatch(/2,000 Flybuys points/i);
  });
});

describe("stack integration — action-gated gift cards", () => {
  it("marks a membership-required card optional and never deducts it", () => {
    const data = makeStackData({
      // A store discount anchors the recommendation so the optional gift card
      // still renders (an optional-only stack is dropped by design).
      stores: [makeStore({ id: "myer", discountPercent: 10, discountCode: "SAVE10" })],
      giftCardOffers: [
        makeGiftCard({
          discountPercent: 8,
          membershipRequired: true,
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");

    // Only the $50 discount is deducted; the membership card is not.
    expect(rec.effectivePrice).toBe(450);
    expect(giftCard?.optional).toBe(true);
    expect(giftCard?.compatibilityStatus).toBe("requires-verification");
    expect(
      rec.warnings.some((w) => w.code === "gift-card-membership-required")
    ).toBe(true);
  });
});

describe("stack integration — compatibility verdict on a plain card", () => {
  it("requires verification when acceptance is listed but lacks evidence", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "myer", discountPercent: 1, discountCode: "SAVE1" }),
      ],
      giftCardOffers: [
        makeGiftCard({ discountPercent: 5, acceptedAtMerchantIds: ["myer"] }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((component) => component.layer === "gift-card");
    expect(giftCard?.valueDollars).toBe(24.75);
    expect(giftCard?.optional).toBe(true);
    expect(rec.effectivePrice).toBe(495);
    expect(giftCard?.compatibilityStatus).toBe("requires-verification");
    expect(giftCard?.compatibilityStages?.acquisition.status).toBe("compatible");
    expect(giftCard?.compatibilityStages?.redemption.status).toBe(
      "requires-verification"
    );
  });

  it("uses published acceptance evidence in the same two-stage verdict", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer" })],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [
        makeGiftCard({
          productId: "product-1",
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((component) => component.layer === "gift-card");
    expect(giftCard?.compatibilityStages?.acquisition.status).toBe("compatible");
    expect(giftCard?.compatibilityStages?.redemption.status).toBe(
      "likely-compatible"
    );
    expect(giftCard?.compatibilityStatus).toBe("likely-compatible");
  });
});

describe("stack integration — qualifying thresholds and limits", () => {
  it("applies a fixed-dollar checkout discount only after its threshold", () => {
    const eligibleData = makeStackData({
      stores: [makeStore({ id: "myer" })],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [
        makeGiftCard({
          productId: "product-1",
          discountPercent: 0,
          promotionType: "fixed-dollar-discount",
          fixedDiscountDollars: 20,
          thresholdDollars: 200,
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [eligible] = buildStackRecommendations(undefined, 250, eligibleData, TEST_NOW);
    expect(eligible.effectivePrice).toBe(230);
    expect(eligible.totalSaving).toBe(20);

    const ineligibleData = makeStackData({
      ...eligibleData,
      stores: [
        makeStore({ id: "myer", discountPercent: 5, discountCode: "SAVE5" }),
      ],
    });
    const [ineligible] = buildStackRecommendations(undefined, 100, ineligibleData, TEST_NOW);
    expect(ineligible.effectivePrice).toBe(95);
    expect(ineligible.components.some((component) => component.layer === "gift-card")).toBe(
      false
    );
  });

  it("caps percentage savings by denomination multiplied by use count", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer" })],
      giftCardProducts: [makeGiftCardProduct({ maxDenomination: 100 })],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [
        makeGiftCard({
          productId: "product-1",
          discountPercent: 10,
          usesPerCustomer: 2,
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.totalSaving).toBe(20);
    expect(rec.effectivePrice).toBe(480);
    expect(rec.warnings.some((warning) => warning.code === "gift-card-usage-limit")).toBe(
      true
    );
  });
});
