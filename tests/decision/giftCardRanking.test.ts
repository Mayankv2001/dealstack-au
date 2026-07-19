import { describe, expect, it } from "vitest";
import { buildDecisionResult } from "@/lib/decision/buildDecisionResult";
import type { DealsBundle } from "@/lib/deals/load";
import { makeGiftCard, makeGiftCardAcceptance, makeGiftCardProduct, makeStackData, makeStore } from "../stack/factories";

const NOW = new Date("2026-07-15T00:00:00Z");
const store = makeStore({ id: "nike", name: "Nike", aliases: ["Nike Australia"] });
const bundle: DealsBundle = { stores: [store], deals: [], stackRecommendations: [], stackData: makeStackData(), partial: false };
const products = [
  makeGiftCardProduct({ id: "tcn-shop", brand: "TCN Shop", slug: "tcn-shop" }),
  makeGiftCardProduct({ id: "tcn-love", brand: "TCN Love", slug: "tcn-love" }),
];
const official = makeGiftCardAcceptance({ id: "official", productId: "tcn-shop", storeId: "nike", merchantName: "Nike", evidenceSourceType: "issuer-official", lastCheckedAt: "2026-07-14T00:00:00Z", acceptsOnline: true });
const unofficial = makeGiftCardAcceptance({ id: "unofficial", productId: "tcn-love", storeId: "nike", merchantName: "Nike", acceptanceStatus: "unofficially-reported", evidenceSourceType: "community", lastCheckedAt: "2026-07-14T00:00:00Z", acceptsOnline: false });
const offers = [
  makeGiftCard({ id: "shop-offer", productId: "tcn-shop", brand: "TCN Shop", acceptedAtMerchantIds: [], expiryDate: "2026-07-31" }),
  makeGiftCard({ id: "love-offer", productId: "tcn-love", brand: "TCN Love", acceptedAtMerchantIds: [], expiryDate: "2026-07-31", discountPercent: 10 }),
];

function ids(offerOrder = offers, acceptanceOrder = [official, unofficial]) {
  return buildDecisionResult("Nike Australia", 500, {
    bundle,
    products,
    acceptance: acceptanceOrder,
    giftCardOffers: offerOrder,
  }, NOW).retailerGiftCardPlans[0].giftCardOptions.map((option) => option.offer.id);
}

describe("evidence-aware gift-card planner ranking", () => {
  it("returns every current accepted product and is stable across input permutations", () => {
    expect(ids()).toEqual(["shop-offer", "love-offer"]);
    expect(ids([...offers].reverse(), [unofficial, official])).toEqual(["shop-offer", "love-offer"]);
  });

  it("surfaces channels and never lets a stronger discount override stronger evidence", () => {
    const result = buildDecisionResult("Nike", 500, { bundle, products, acceptance: [unofficial, official], giftCardOffers: offers }, NOW);
    const [first, second] = result.retailerGiftCardPlans[0].giftCardOptions;
    expect(first.offer.id).toBe("shop-offer");
    expect(first.redemptionChannels).toContain("Online");
    expect(second.evidenceLabel).toBe("Acceptance requires verification");
  });

  it("excludes stale acceptance and expired offers with truthful reasons", () => {
    const stale = { ...unofficial, lastCheckedAt: "2026-01-01T00:00:00Z" };
    const expired = { ...offers[0], expiryDate: "2026-07-01" };
    const result = buildDecisionResult("Nike", 500, { bundle, products, acceptance: [official, stale], giftCardOffers: [expired, offers[1]] }, NOW);
    expect(result.retailerGiftCardPlans[0].giftCardOptions).toEqual([]);
    expect(result.retailerGiftCardPlans[0].excludedGiftCardOptions.map((option) => option.exclusionReason)).toEqual(expect.arrayContaining([
      expect.stringMatching(/expired/i),
      expect.stringMatching(/stale/i),
    ]));
  });

  it("excludes an approved offer whose start date has not arrived", () => {
    const future = {
      ...offers[0],
      startDate: "2026-07-16",
      expiryDate: "2026-07-31",
    };
    const result = buildDecisionResult(
      "Nike",
      500,
      { bundle, products, acceptance: [official], giftCardOffers: [future] },
      NOW,
    );
    expect(result.currentGiftCardOffers).toEqual([]);
    expect(result.retailerGiftCardPlans[0].giftCardOptions).toEqual([]);
    expect(result.retailerGiftCardPlans[0].excludedGiftCardOptions[0].exclusionReason)
      .toMatch(/starts on 2026-07-16/i);
  });

  it("returns an ambiguous result with no recommendation when aliases tie", () => {
    const tiedBundle = { ...bundle, stores: [store, makeStore({ id: "nike-outlet", name: "Nike Outlet", aliases: ["Nike Australia"] })] };
    const result = buildDecisionResult("Nike Australia", 500, { bundle: tiedBundle, products, acceptance: [official], giftCardOffers: offers }, NOW);
    expect(result.ambiguous).toBe(true);
    expect(result.retailerGiftCardPlans).toEqual([]);
  });
});
