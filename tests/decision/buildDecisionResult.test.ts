import { describe, expect, it } from "vitest";
import type { PublicDeal } from "@/lib/deals/types";
import type { DealsBundle } from "@/lib/deals/load";
import { buildDecisionResult } from "@/lib/decision/buildDecisionResult";
import type { StackRecommendation } from "@/lib/offers/types";
import {
  makeGiftCard,
  makeGiftCardAcceptance,
  makeGiftCardProduct,
  makeStore,
} from "../stack/factories";

const stack: StackRecommendation = {
  merchantId: "myer",
  merchantName: "Myer",
  title: "5% gift cards at Myer",
  kind: "cash",
  basePrice: 500,
  components: [],
  effectivePrice: 475,
  effectiveDiscountPercent: 5,
  totalSaving: 25,
  verifiedSaving: 25,
  checkedAsOf: "2026-07-10T00:00:00Z",
  soonestExpiry: "2026-07-20",
  pointsEarned: 0,
  pointsValueDollars: 0,
  confidence: "confirmed",
  warnings: [],
  citations: [
    { source: "gcdb", sourceUrl: "https://gcdb.com.au/a" },
    { source: "freepoints", sourceUrl: "https://freepoints.com.au/b" },
  ],
  weekOf: "2026-07-06",
};

const community: PublicDeal = {
  id: "community:1",
  kind: "community",
  title: "Myer offer discussion",
  summary: "Community-reported activity.",
  merchantId: "myer",
  merchantName: "Myer",
  category: "Community deal",
  tags: [],
  priceText: null,
  priceValue: null,
  wasPrice: null,
  savingPercent: null,
  couponCode: null,
  trust: "community",
  dealStackVerified: false,
  membershipRequired: false,
  activationRequired: false,
  targeted: false,
  channelNote: null,
  postedAt: "2026-07-11T00:00:00Z",
  lastCheckedAt: "2026-07-12T00:00:00Z",
  expiryDate: "2026-07-20",
  dateStatus: "confirmed-current",
  sourceName: "OzBargain",
  publisherFamily: "ozbargain",
  capturedAt: "2026-07-12T00:00:00Z",
  sourceUrl: "https://www.ozbargain.com.au/node/1",
  detailPath: "/deals/signal/1",
  stackable: true,
  productGroup: null,
  sourceNativeId: "ozb:1",
  votes: 50,
  comments: 10,
  searchText: "myer offer discussion",
  score: 70,
};

function bundle(over: Partial<DealsBundle> = {}): DealsBundle {
  return {
    stores: [makeStore()],
    deals: [community],
    stackRecommendations: [stack],
    partial: false,
    ...over,
  };
}

describe("DecisionResult", () => {
  it("returns a genuine empty planner state when no query is supplied", () => {
    const result = buildDecisionResult("", 500, {
      bundle: bundle(),
      products: [makeGiftCardProduct()],
      acceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [makeGiftCard()],
    });
    expect(result.selectedTarget).toBeNull();
    expect(result.bestCashStack).toBeNull();
    expect(result.rewardsStack).toBeNull();
    expect(result.currentGiftCardOffers).toEqual([]);
    expect(result.communityPulse).toEqual([]);
  });

  it("builds one store plan and deduplicates publisher ownership", () => {
    const product = makeGiftCardProduct();
    const result = buildDecisionResult("Myer", 500, {
      bundle: bundle(),
      products: [product],
      acceptance: [makeGiftCardAcceptance()],
      giftCardOffers: [
        makeGiftCard({
          productId: product.id,
          acceptedAtMerchantIds: ["myer"],
          expiryDate: "2026-07-20",
          citations: [
            { source: "gcdb", sourceUrl: "https://gcdb.com.au/offer" },
          ],
        }),
      ],
    });
    expect(result.selectedTarget).toMatchObject({ kind: "store", id: "myer" });
    expect(result.bestCashStack?.effectivePrice).toBe(475);
    expect(result.currentGiftCardOffers).toHaveLength(1);
    expect(result.acceptedCards).toHaveLength(1);
    expect(result.communityPulse[0]).toMatchObject({
      sourceUrl: "https://www.ozbargain.com.au/node/1",
      publisherFamily: "ozbargain",
      capturedAt: "2026-07-12T00:00:00Z",
      votes: 50,
      comments: 10,
    });
    // GCDB + FreePoints are one family; OzBargain is the second.
    expect(result.freshness.sourceFamilyCount).toBe(2);
    expect(result.freshness.oldestVerificationDate).toBe(
      "2026-06-12T00:00:00+10:00",
    );
  });

  it("does not guess between multiple matching gift-card products", () => {
    const result = buildDecisionResult("Apple", 500, {
      bundle: bundle({ deals: [], stackRecommendations: [] }),
      products: [
        makeGiftCardProduct({
          id: "apple-physical",
          brand: "Apple",
          slug: "apple-physical",
        }),
        makeGiftCardProduct({
          id: "apple-digital",
          brand: "Apple",
          slug: "apple-digital",
        }),
      ],
      acceptance: [],
      giftCardOffers: [],
    });
    expect(result.ambiguous).toBe(true);
    expect(result.selectedTarget).toBeNull();
    expect(result.targetGroups.giftCards).toHaveLength(2);
  });

  it("uses the same cash-stack result for its points summary when points are included", () => {
    const stackWithPoints: StackRecommendation = {
      ...stack,
      pointsEarned: 500,
      pointsValueDollars: 2.5,
      components: [
        {
          layer: "gift-card",
          label: "5% gift card",
          valueDollars: 25,
          optional: false,
          citation: { source: "gcdb", sourceUrl: "https://gcdb.com.au/offer" },
          confidence: "confirmed",
        },
        {
          layer: "points",
          label: "1 point per $1",
          pointsEarned: 500,
          valueDollars: 2.5,
          optional: false,
          citation: {
            source: "freepoints",
            sourceUrl: "https://freepoints.com.au/offer",
          },
          confidence: "confirmed",
        },
      ],
    };
    const result = buildDecisionResult("Myer", 500, {
      bundle: bundle({ stackRecommendations: [stackWithPoints] }),
      products: [],
      acceptance: [],
      giftCardOffers: [],
    });
    expect(result.bestCashStack).toBe(stackWithPoints);
    expect(result.rewardsStack).toBe(stackWithPoints);
    expect(result.rewardsStack?.pointsEarned).toBe(500);
  });
});
