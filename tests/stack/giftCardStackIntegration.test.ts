import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "../../lib/stack/buildStack";
import {
  TEST_NOW,
  makeGiftCard,
  makeStackData,
  makeStore,
} from "./factories";

/**
 * Focused coverage for the migration-021 gift-card integration into the stack
 * engine: bonus-value and points cards now contribute their effective saving
 * (not "0% off"), action-gated cards are optional and never deducted from the
 * guaranteed price, and every gift-card layer carries a structured
 * compatibility verdict. Plain-discount behaviour is covered by buildStack.test.
 */

const giftCardComponent = (spend: number, offer: Parameters<typeof makeGiftCard>[0]) => {
  const data = makeStackData({
    stores: [makeStore({ id: "myer", discountPercent: 0 })],
    giftCardOffers: [makeGiftCard({ acceptedAtMerchantIds: ["myer"], ...offer })],
  });
  const [rec] = buildStackRecommendations(undefined, spend, data, TEST_NOW);
  return { rec, giftCard: rec?.components.find((c) => c.layer === "gift-card") };
};

describe("stack integration — bonus-value gift cards", () => {
  it("contributes its effective net-cost saving instead of being read as 0% off", () => {
    const { rec, giftCard } = giftCardComponent(500, {
      discountPercent: 0,
      promotionType: "bonus-value",
      bonusPercent: 10,
    });
    expect(giftCard).toBeDefined();
    // 10% bonus value → 9.09% effective → $45.45 on $500.
    expect(giftCard?.valueDollars).toBe(45.45);
    expect(giftCard?.label).toMatch(/effective/i);
    expect(giftCard?.optional).toBe(false);
    expect(rec.effectivePrice).toBe(454.55);
    expect(giftCard?.compatibilityStatus).toBe("likely-compatible");
    expect(giftCard?.compatibilityReason).toBeTruthy();
  });
});

describe("stack integration — points gift cards", () => {
  it("values a points card at the disclosed rate and stacks it", () => {
    const { rec, giftCard } = giftCardComponent(500, {
      discountPercent: 0,
      promotionType: "points",
      pointsMultiplier: 20,
      pointsProgram: "Everyday Rewards",
    });
    expect(giftCard?.valueDollars).toBe(45.45); // 9.09% effective
    expect(giftCard?.label).toMatch(/effective/i);
    expect(rec.effectivePrice).toBe(454.55);
    expect(giftCard?.compatibilityStatus).toBe("likely-compatible");
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
    expect(rec.warnings.some((w) => w.code === "gift-card-requires-action")).toBe(true);
  });
});

describe("stack integration — compatibility verdict on a plain card", () => {
  it("attaches a 'compatible' verdict to a clean confirmed discount card", () => {
    const { giftCard } = giftCardComponent(500, { discountPercent: 5 });
    expect(giftCard?.valueDollars).toBe(25);
    expect(giftCard?.compatibilityStatus).toBe("compatible");
    expect(giftCard?.compatibilityReason).toMatch(/ready to stack/i);
  });
});
