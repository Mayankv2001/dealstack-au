import { describe, expect, it } from "vitest";
import {
  deriveMerchantFacts,
  layerFactFromComponent,
} from "@/lib/deals/merchantFacts";
import type {
  StackComponent,
  StackRecommendation,
} from "@/lib/offers/types";

function component(over: Partial<StackComponent> = {}): StackComponent {
  return {
    layer: "gift-card",
    label: "5% off via Ultimate cards (RACV)",
    valuePercent: 5,
    valueDollars: 25,
    optional: false,
    citation: { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    confidence: "confirmed",
    ...over,
  };
}

function recommendation(
  over: Partial<StackRecommendation> = {},
): StackRecommendation {
  return {
    merchantId: "jb-hifi",
    merchantName: "JB Hi-Fi",
    title: "5% gift cards at JB Hi-Fi",
    kind: "cash",
    basePrice: 500,
    components: [component()],
    effectivePrice: 475,
    payAtCheckout: 475,
    cashbackLater: 0,
    effectiveDiscountPercent: 5,
    totalSaving: 25,
    verifiedSaving: 25,
    checkedAsOf: "2026-06-11T22:00:00+10:00",
    soonestExpiry: null,
    pointsEarned: 0,
    pointsValueDollars: 0,
    confidence: "confirmed",
    warnings: [],
    citations: [],
    weekOf: "2026-06-08",
    ...over,
  };
}

describe("layerFactFromComponent", () => {
  it("marks a confirmed, fully compatible layer as works with no reason", () => {
    const fact = layerFactFromComponent(
      component({ compatibilityStatus: "compatible" }),
    );
    expect(fact.state).toBe("works");
    expect(fact.reason).toBeNull();
  });

  it("maps incompatible to does-not-stack with the engine's reason", () => {
    const fact = layerFactFromComponent(
      component({
        compatibilityStatus: "incompatible",
        compatibilityReason: "Not accepted at this retailer.",
      }),
    );
    expect(fact.state).toBe("no-stack");
    expect(fact.reason).toBe("Not accepted at this retailer.");
  });

  it("maps insufficient-evidence to its own state, never to works", () => {
    const fact = layerFactFromComponent(
      component({ compatibilityStatus: "insufficient-evidence" }),
    );
    expect(fact.state).toBe("insufficient-evidence");
    expect(fact.reason).toBeTruthy();
  });

  it("treats requires-verification as conditional with a reason", () => {
    const fact = layerFactFromComponent(
      component({
        compatibilityStatus: "requires-verification",
        compatibilityReason: "Confirm the current terms first.",
      }),
    );
    expect(fact.state).toBe("conditional");
    expect(fact.reason).toBe("Confirm the current terms first.");
  });

  it("never marks an unverified layer as works", () => {
    const fact = layerFactFromComponent(
      component({ confidence: "needs-verification" }),
    );
    expect(fact.state).toBe("conditional");
    expect(fact.reason).toMatch(/unverified/i);
  });

  it("treats a choose-one alternative as conditional with the conflict reason", () => {
    const fact = layerFactFromComponent(
      component({
        layer: "cashback",
        optional: true,
        note: "Use instead of the gift card, not together.",
      }),
    );
    expect(fact.state).toBe("conditional");
    expect(fact.reason).toBe("Use instead of the gift card, not together.");
  });

  it("includes the coupon code in a discount layer label", () => {
    const fact = layerFactFromComponent(
      component({
        layer: "discount",
        valuePercent: 10,
        code: "MYER10",
        compatibilityStatus: undefined,
      }),
    );
    expect(fact.label).toBe("10% code MYER10");
  });
});

describe("deriveMerchantFacts", () => {
  it("keys facts by merchant and prefers the included layer over alternatives", () => {
    const rec = recommendation({
      components: [
        component({ compatibilityStatus: "compatible" }),
        component({
          layer: "cashback",
          label: "6% ShopBack cashback (alternative to gift card)",
          optional: true,
          note: "Use instead of the gift card, not together.",
        }),
      ],
    });
    const facts = deriveMerchantFacts([rec]);
    const jb = facts.get("jb-hifi");
    expect(jb).toBeDefined();
    expect(jb!.giftCard?.state).toBe("works");
    expect(jb!.cashback?.state).toBe("conditional");
    expect(jb!.cashback?.reason).toMatch(/instead of the gift card/i);
    expect(jb!.payAtCheckout).toBe(475);
    expect(jb!.cashbackLater).toBe(0);
  });

  it("returns no entry for merchants without a recommendation", () => {
    const facts = deriveMerchantFacts([recommendation()]);
    expect(facts.get("costco")).toBeUndefined();
  });
});
