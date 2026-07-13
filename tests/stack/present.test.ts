import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import {
  MIN_BEST_STACK_DISCOUNT_PERCENT,
  hasChooseOneLayer,
  layerCompatibility,
  layerUncertaintyDetails,
  partitionStacks,
  qualifiesAsBestStack,
  rankBestStacks,
  stackTrustStatus,
} from "@/lib/stack/present";
import {
  TEST_NOW,
  makeCashback,
  makeGiftCardAcceptance,
  makeGiftCard,
  makeGiftCardProduct,
  makePoints,
  makeStackData,
  makeStore,
} from "./factories";

describe("Best-stack qualification", () => {
  it("excludes a zero-cash-saving stack from Best stacks", () => {
    // A points-only merchant: no discount, no gift-card/cashback saving.
    const data = makeStackData({
      stores: [makeStore({ id: "coles", name: "Coles", discountPercent: 0 })],
      pointsOffers: [makePoints({ merchantId: "coles", earnMultiple: 1 })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.totalSaving).toBe(0);
    expect(qualifiesAsBestStack(rec)).toBe(false);

    const { best, rewards } = partitionStacks([rec]);
    expect(best).toHaveLength(0);
    expect(rewards).toHaveLength(1);
  });

  it("routes a points-only result into Rewards opportunities, not Best stacks", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "woolworths", name: "Woolworths", discountPercent: 0 })],
      pointsOffers: [makePoints({ merchantId: "woolworths", earnMultiple: 20 })],
    });
    const recs = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const { best, rewards } = partitionStacks(recs);
    expect(best).toHaveLength(0);
    expect(rewards.map((r) => r.merchantId)).toContain("woolworths");
    expect(rewards[0].kind).toBe("points-only");
  });

  it("keeps a real cash saving in Best stacks", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 10, discountCode: "MYER10" })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(qualifiesAsBestStack(rec)).toBe(true);
    expect(rec.kind).toBe("cash");
  });

  it("rejects an effective discount at or below the threshold", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      // 0.1% cashback on $500 = $0.50 → rounds to 0.1% effective, below the 1% floor.
      cashbackOffers: [makeCashback({ ratePercent: 0.1 })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.effectiveDiscountPercent).toBeLessThan(MIN_BEST_STACK_DISCOUNT_PERCENT);
    expect(qualifiesAsBestStack(rec)).toBe(false);
  });
});

describe("rankBestStacks", () => {
  it("ranks stronger cash savings above weaker ones", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "small", name: "Small", discountPercent: 2, discountCode: "S2" }),
        makeStore({ id: "big", name: "Big", discountPercent: 20, discountCode: "B20" }),
        makeStore({ id: "mid", name: "Mid", discountPercent: 10, discountCode: "M10" }),
      ],
    });
    const { best } = partitionStacks(
      buildStackRecommendations(undefined, 500, data, TEST_NOW)
    );
    expect(best.map((r) => r.merchantId)).toEqual(["big", "mid", "small"]);
  });

  it("does not mutate the input array", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "a", name: "A", discountPercent: 5, discountCode: "A5" }),
        makeStore({ id: "b", name: "B", discountPercent: 15, discountCode: "B15" }),
      ],
    });
    const recs = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const before = recs.map((r) => r.merchantId);
    rankBestStacks(recs);
    expect(recs.map((r) => r.merchantId)).toEqual(before);
  });
});

describe("stackTrustStatus", () => {
  it("reports all-checked when every layer is confirmed", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [
        makeGiftCard({ productId: "product-1", discountPercent: 5, acceptedAtMerchantIds: ["myer"], confidence: "confirmed" }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(stackTrustStatus(rec)).toEqual({
      label: "All layers source checked",
      tone: "verified",
    });
  });

  it("counts the single layer that needs verification", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 10, discountCode: "MYER10" })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const status = stackTrustStatus(rec);
    expect(status.label).toBe("1 layer needs verification");
    expect(status.tone).toBe("caution");
  });
});

describe("layerCompatibility", () => {
  it("labels the weaker side of a gift-card/cashback conflict as choose-one", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({ discountPercent: 5, acceptedAtMerchantIds: ["myer"] }),
      ],
      cashbackOffers: [
        makeCashback({ ratePercent: 4, excludesGiftCardPayment: true }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(hasChooseOneLayer(rec)).toBe(true);
    const optional = rec.components.find((c) => c.optional)!;
    const combined = rec.components.find((c) => !c.optional)!;
    expect(layerCompatibility(optional)).toBe("choose-one");
    expect(layerCompatibility(combined)).toBe("combined");
  });
});

describe("layerUncertaintyDetails", () => {
  it("returns the stored two-stage reasons only for uncertain layers", () => {
    const component = {
      layer: "gift-card" as const,
      label: "5% gift card",
      optional: true,
      citation: { source: "gcdb" as const, sourceUrl: "https://gcdb.com.au" },
      confidence: "confirmed" as const,
      compatibilityStatus: "requires-verification" as const,
      compatibilityWarnings: ["Check acceptance", "Check acceptance"],
      compatibilityStages: {
        acquisition: { status: "compatible" as const, reason: "Purchase confirmed." },
        redemption: {
          status: "requires-verification" as const,
          reason: "Acceptance is only listed.",
        },
      },
    };
    expect(layerUncertaintyDetails(component)).toEqual({
      acquisition: "Purchase confirmed.",
      redemption: "Acceptance is only listed.",
      warnings: ["Check acceptance"],
    });
    expect(
      layerUncertaintyDetails({
        ...component,
        compatibilityStatus: "likely-compatible",
      })
    ).toBeNull();
  });
});
