import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import {
  buildSmartStackResults,
  priceReliesOnUnverifiedLayer,
} from "@/lib/stack/smartStack";
import {
  TEST_NOW,
  makeCashback,
  makeGiftCard,
  makeGiftCardAcceptance,
  makeGiftCardProduct,
  makeSignal,
  makeStackData,
  makeStore,
} from "./factories";

/**
 * The checkout/later split: cashback must never reduce the "pay at checkout"
 * figure, while discount codes and discounted gift cards do. Also covers the
 * verified-preference tie-break for equal comparable prices in Smart Stack.
 */

describe("payAtCheckout / cashbackLater", () => {
  it("keeps cashback out of the checkout price", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", name: "Myer" })],
      cashbackOffers: [
        makeCashback({ merchantId: "myer", ratePercent: 10 }),
      ],
    });
    const [rec] = buildStackRecommendations("myer", 100, data, TEST_NOW);
    expect(rec.payAtCheckout).toBe(100); // full price at the till
    expect(rec.cashbackLater).toBe(10); // received later
    expect(rec.effectivePrice).toBe(90); // net of both
  });

  it("deducts a discounted gift card from the checkout price", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", name: "Myer" })],
      giftCardOffers: [
        makeGiftCard({
          productId: "product-1",
          acceptedAtMerchantIds: ["myer"],
          discountPercent: 5,
        }),
      ],
      giftCardProducts: [makeGiftCardProduct()],
      giftCardAcceptance: [makeGiftCardAcceptance({ storeId: "myer" })],
    });
    const [rec] = buildStackRecommendations("myer", 100, data, TEST_NOW);
    expect(rec.payAtCheckout).toBe(95);
    expect(rec.cashbackLater).toBe(0);
    expect(rec.effectivePrice).toBe(95);
  });

  it("splits a code + cashback stack into now and later amounts", () => {
    const data = makeStackData({
      stores: [
        makeStore({
          id: "myer",
          name: "Myer",
          discountPercent: 10,
          discountCode: "MYER10",
        }),
      ],
      cashbackOffers: [makeCashback({ merchantId: "myer", ratePercent: 5 })],
    });
    const [rec] = buildStackRecommendations("myer", 100, data, TEST_NOW);
    // $100 − 10% code = $90 at checkout; 5% of $90 = $4.50 later.
    expect(rec.payAtCheckout).toBe(90);
    expect(rec.cashbackLater).toBe(4.5);
    expect(rec.effectivePrice).toBe(85.5);
  });
});

describe("Smart Stack verified preference", () => {
  const priced = (merchantId: string, id: string) =>
    makeSignal({
      id,
      merchantId,
      title: "Widget deal",
      priceText: "$100",
      productGroup: "widget-1",
      status: "approved",
      signalScore: 0.5,
    });

  it("labels prices that rely on an unverified layer", () => {
    const data = makeStackData({
      stores: [
        makeStore({
          id: "myer",
          name: "Myer",
          discountPercent: 5,
          discountCode: "CODE5",
        }),
      ],
      ozBargainSignals: [priced("myer", "sig-a")],
    });
    const [result] = buildSmartStackResults("widget", data, TEST_NOW);
    // Store discount codes always carry needs-verification confidence.
    expect(priceReliesOnUnverifiedLayer(result)).toBe(true);
  });

  it("does not flag a fully verified stack", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", name: "Myer" })],
      cashbackOffers: [
        makeCashback({ merchantId: "myer", confidence: "confirmed" }),
      ],
      ozBargainSignals: [priced("myer", "sig-b")],
    });
    const [result] = buildSmartStackResults("widget", data, TEST_NOW);
    expect(priceReliesOnUnverifiedLayer(result)).toBe(false);
  });
});
