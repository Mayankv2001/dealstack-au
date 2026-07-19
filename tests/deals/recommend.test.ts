import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, type DealsParams } from "@/lib/deals/params";
import {
  buildDealRecommendations,
  hasPurchaseIntent,
} from "@/lib/deals/recommend";
import type { PublicDeal } from "@/lib/deals/types";
import type { StackRecommendation } from "@/lib/offers/types";
import type { StackData } from "@/lib/stack/buildStack";
import {
  TEST_NOW,
  makeGiftCard,
  makeGiftCardAcceptance,
  makeGiftCardProduct,
  makeStackData,
  makeStore,
} from "../stack/factories";

/**
 * The recommendation strip: fixed role order, deduped routes, verified
 * preferred over equal unverified. Engine maths itself is covered by
 * tests/stack/buildStack.test.ts — here we assert selection behaviour.
 */

function deal(over: Partial<PublicDeal> = {}): PublicDeal {
  const base: PublicDeal = {
    id: "community:1",
    kind: "community",
    title: "MacBook Air M3 at JB Hi-Fi",
    summary: "Current listing",
    merchantId: "jb-hifi",
    merchantName: "JB Hi-Fi",
    category: "Electronics",
    tags: ["laptop"],
    priceText: "$1,799",
    priceValue: 1799,
    wasPrice: 2199,
    savingPercent: 18,
    couponCode: null,
    trust: "community",
    dealStackVerified: false,
    membershipRequired: false,
    activationRequired: false,
    targeted: false,
    channelNote: "Online",
    postedAt: "2026-06-11T01:00:00Z",
    lastCheckedAt: "2026-06-11T02:00:00Z",
    expiryDate: "2026-08-15",
    dateStatus: "confirmed-current",
    sourceName: "OzBargain",
    publisherFamily: "ozbargain",
    capturedAt: "2026-06-11T02:00:00Z",
    sourceUrl: "https://www.ozbargain.com.au/node/1",
    detailPath: "/deals/signal/1",
    stackable: true,
    productGroup: "macbook-air-m3",
    sourceNativeId: "ozb:1",
    votes: 20,
    comments: 4,
    searchText: "macbook air m3 jb hi-fi laptop",
    score: 60,
  };
  return { ...base, ...over };
}

const params = (over: Partial<DealsParams> = {}): DealsParams => ({
  ...DEFAULT_PARAMS,
  q: "macbook",
  ...over,
});

/** Stack data with a verified 5% gift card at JB Hi-Fi and none at Costco. */
function stackData(): StackData {
  return makeStackData({
    stores: [
      makeStore({ id: "jb-hifi", name: "JB Hi-Fi" }),
      makeStore({ id: "costco", name: "Costco" }),
    ],
    giftCardOffers: [
      makeGiftCard({
        id: "gc-ultimate",
        productId: "product-1",
        acceptedAtMerchantIds: ["jb-hifi"],
        discountPercent: 5,
        confidence: "confirmed",
      }),
    ],
    giftCardProducts: [makeGiftCardProduct()],
    giftCardAcceptance: [makeGiftCardAcceptance({ storeId: "jb-hifi" })],
  });
}

describe("hasPurchaseIntent", () => {
  it("requires a query, category or store", () => {
    expect(hasPurchaseIntent(DEFAULT_PARAMS)).toBe(false);
    expect(hasPurchaseIntent(params())).toBe(true);
    expect(hasPurchaseIntent(params({ q: "", cat: "laptops" }))).toBe(true);
    expect(hasPurchaseIntent(params({ q: "", merchant: "jb-hifi" }))).toBe(
      true,
    );
  });
});

describe("buildDealRecommendations", () => {
  it("returns nothing without purchase intent", () => {
    const result = buildDealRecommendations(
      [deal()],
      [],
      stackData(),
      DEFAULT_PARAMS,
      TEST_NOW,
    );
    expect(result).toEqual([]);
  });

  it("anchors checkout figures to the listed price and separates cashback", () => {
    const [first] = buildDealRecommendations(
      [deal()],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(first).toBeDefined();
    expect(first.listedPrice).toBe(1799);
    // 5% verified gift card: pay 0.95 × $1,799 at checkout, nothing later.
    expect(first.payAtCheckout).toBeCloseTo(1799 * 0.95, 2);
    expect(first.cashbackLater).toBe(0);
    expect(first.verifiedSaving).toBeCloseTo(1799 * 0.05, 2);
  });

  it("merges roles instead of duplicating one route", () => {
    const result = buildDealRecommendations(
      [deal()],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    // One merchant+product route: best-verified and lowest-checkout merge.
    expect(result).toHaveLength(1);
    expect(result[0].roles).toContain("best-verified");
    expect(result[0].roles).toContain("lowest-checkout");
  });

  it("keeps fixed role order with the verified stack first", () => {
    const cheaperElsewhere = deal({
      id: "community:2",
      merchantId: "costco",
      merchantName: "Costco",
      priceText: "$1,749",
      priceValue: 1749,
      sourceNativeId: "ozb:2",
      searchText: "macbook air m3 costco laptop",
    });
    const result = buildDealRecommendations(
      [deal(), cheaperElsewhere],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].roles[0]).toBe("best-verified");
    expect(result[0].merchantId).toBe("jb-hifi");
    const lowest = result.find((item) => item.roles.includes("lowest-checkout"));
    // Costco $1,749 listed beats JB's $1,709.05 after stack? No: 1709.05 < 1749,
    // so JB also holds lowest-checkout; Costco can only be the alternative.
    expect(lowest?.merchantId).toBe("jb-hifi");
    const alternative = result.find((item) =>
      item.roles.includes("best-alternative"),
    );
    expect(alternative?.merchantId).toBe("costco");
    expect(alternative?.payAtCheckout).toBe(1749);
  });

  it("prefers the verified option when checkout prices are equal", () => {
    // Two retailers, identical listed price. JB has a VERIFIED 5% gift card;
    // "kogan" gets an UNVERIFIED 5% gift card — same dollar value.
    const data = makeStackData({
      stores: [
        makeStore({ id: "jb-hifi", name: "JB Hi-Fi" }),
        makeStore({ id: "kogan", name: "Kogan" }),
      ],
      giftCardOffers: [
        makeGiftCard({
          id: "gc-verified",
          productId: "product-1",
          acceptedAtMerchantIds: ["jb-hifi"],
          discountPercent: 5,
          confidence: "confirmed",
        }),
        makeGiftCard({
          id: "gc-unverified",
          productId: "product-2",
          acceptedAtMerchantIds: ["kogan"],
          discountPercent: 5,
          confidence: "needs-verification",
        }),
      ],
      giftCardProducts: [
        makeGiftCardProduct(),
        makeGiftCardProduct({ id: "product-2", slug: "product-2" }),
      ],
      giftCardAcceptance: [
        makeGiftCardAcceptance({ storeId: "jb-hifi" }),
        makeGiftCardAcceptance({
          id: "acceptance-2",
          productId: "product-2",
          storeId: "kogan",
          merchantName: "Kogan",
        }),
      ],
    });
    const kogan = deal({
      id: "community:3",
      merchantId: "kogan",
      merchantName: "Kogan",
      sourceNativeId: "ozb:3",
      searchText: "macbook air m3 kogan laptop",
    });
    const result = buildDealRecommendations(
      [kogan, deal()],
      [],
      data,
      params(),
      TEST_NOW,
    );
    const lowest = result.find((item) => item.roles.includes("lowest-checkout"));
    expect(lowest?.merchantId).toBe("jb-hifi");
  });

  it("skips routes with neither a price nor any saving layer", () => {
    // Costco: no stack layers on file, and this listing has no parsed price.
    const bare = deal({
      id: "community:9",
      merchantId: "costco",
      merchantName: "Costco",
      priceText: null,
      priceValue: null,
      wasPrice: null,
      sourceNativeId: "ozb:9",
      searchText: "macbook costco",
    });
    const result = buildDealRecommendations(
      [bare],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(result).toEqual([]);
  });

  it("never labels a lone route as the best alternative", () => {
    // Costco has a price but no layers and nothing else qualifies for the
    // primary roles... it takes lowest-checkout, so an alternative may follow;
    // but with ONLY unpriced layer-less routes there is no strip at all
    // (covered above). Here: a single priced route takes lowest-checkout, not
    // best-alternative.
    const costco = deal({
      id: "community:10",
      merchantId: "costco",
      merchantName: "Costco",
      priceText: "$1,749",
      priceValue: 1749,
      sourceNativeId: "ozb:10",
      searchText: "macbook costco",
    });
    const result = buildDealRecommendations(
      [costco],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(result).toHaveLength(1);
    expect(result[0].roles).toEqual(["lowest-checkout"]);
  });

  it("recommends nothing for merchant-less deals", () => {
    const result = buildDealRecommendations(
      [deal({ merchantId: null, merchantName: null })],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(result).toEqual([]);
  });
});

describe("recommendation facts", () => {
  it("carries engine facts for the recommended merchant", () => {
    const [first] = buildDealRecommendations(
      [deal()],
      [],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(first.facts?.giftCard).toBeTruthy();
    expect(first.facts?.giftCard?.state).not.toBe("works"); // acceptance evidence absent
  });
});

describe("stack recommendations fallback", () => {
  it("uses the page-spend recommendation when a deal has no price", () => {
    const spendRec: StackRecommendation = buildDealRecommendationsSeed();
    const unpriced = deal({
      id: "gift-card:gc-1",
      kind: "gift-card",
      priceText: null,
      priceValue: null,
      wasPrice: null,
      sourceNativeId: null,
    });
    const result = buildDealRecommendations(
      [unpriced],
      [spendRec],
      stackData(),
      params(),
      TEST_NOW,
    );
    expect(result[0]?.listedPrice).toBeNull();
    expect(result[0]?.recommendation).toBe(spendRec);
  });
});

/** A minimal spend-based recommendation for the fallback test. */
function buildDealRecommendationsSeed(): StackRecommendation {
  return {
    merchantId: "jb-hifi",
    merchantName: "JB Hi-Fi",
    title: "5% gift cards at JB Hi-Fi",
    kind: "cash",
    basePrice: 500,
    components: [
      {
        layer: "gift-card",
        label: "5% off via Ultimate cards (RACV)",
        valuePercent: 5,
        valueDollars: 25,
        optional: false,
        citation: { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
        confidence: "confirmed",
      },
    ],
    effectivePrice: 475,
    payAtCheckout: 475,
    cashbackLater: 0,
    effectiveDiscountPercent: 5,
    totalSaving: 25,
    verifiedSaving: 25,
    checkedAsOf: null,
    soonestExpiry: null,
    pointsEarned: 0,
    pointsValueDollars: 0,
    confidence: "confirmed",
    warnings: [],
    citations: [],
    weekOf: "2026-06-08",
  };
}
