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
  membershipRequired: false,
  activationRequired: false,
  targeted: false,
  channelNote: null,
  postedAt: "2026-07-11T00:00:00Z",
  lastCheckedAt: "2026-07-12T00:00:00Z",
  expiryDate: "2026-07-20",
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
          citations: [{ source: "gcdb", sourceUrl: "https://gcdb.com.au/offer" }],
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
      "2026-06-12T00:00:00+10:00"
    );
  });

  it("does not guess between multiple matching gift-card products", () => {
    const result = buildDecisionResult("Apple", 500, {
      bundle: bundle({ deals: [], stackRecommendations: [] }),
      products: [
        makeGiftCardProduct({ id: "apple-physical", brand: "Apple", slug: "apple-physical" }),
        makeGiftCardProduct({ id: "apple-digital", brand: "Apple", slug: "apple-digital" }),
      ],
      acceptance: [],
      giftCardOffers: [],
    });
    expect(result.ambiguous).toBe(true);
    expect(result.selectedTarget).toBeNull();
    expect(result.targetGroups.giftCards).toHaveLength(2);
  });
});
