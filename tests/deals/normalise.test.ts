import { describe, expect, it } from "vitest";
import { buildPublicDeals, decodeEntities, deriveSavingPercent } from "@/lib/deals/normalise";
import type { OzBargainSignal } from "@/lib/offers/types";

const signal: OzBargainSignal = { id: "sig-1", sourceNativeId: "ozb:1", merchantId: null, title: "Headphones &amp; case", summary: "Community price", votesSample: 5, sentiment: "neutral", dealKind: "discount-code", sourceUrl: "https://www.ozbargain.com.au/node/1", postedAt: "2026-07-12T01:00:00Z", confidence: "needs-verification", lastCheckedAt: "2026-07-12T02:00:00Z", isSample: false, status: "approved", priceText: "$80 (was $100)", expiryDate: "2026-07-13" };

describe("public deal normalisation", () => {
  it("keeps approved community content honestly community-reported", () => {
    const [deal] = buildPublicDeals({ stores: [], signals: [signal], giftCards: [], cashback: [], points: [], weekly: [], stackableMerchantIds: new Set() }, new Date("2026-07-12T12:00:00+10:00"));
    expect(deal.trust).toBe("community");
    expect(deal.title).toBe("Headphones & case");
    expect(deal.sourceNativeId).toBe("ozb:1");
    expect(deal.savingPercent).toBe(20);
    expect(deal.sourceUrl).toBe("https://www.ozbargain.com.au/node/1");
    expect(deal.publisherFamily).toBe("ozbargain");
    expect(deal.capturedAt).toBe("2026-07-12T02:00:00Z");
    expect(deal.votes).toBe(5);
  });

  it("links community heat to the discussion rather than a merchant destination", () => {
    const [deal] = buildPublicDeals({ stores: [], signals: [{ ...signal, productUrl: "https://retailer.example/product", merchantUrl: "https://retailer.example" }], giftCards: [], cashback: [], points: [], weekly: [], stackableMerchantIds: new Set() });
    expect(deal.sourceUrl).toBe("https://www.ozbargain.com.au/node/1");
  });

  it("does not present a non-OzBargain URL as an OzBargain discussion", () => {
    const [deal] = buildPublicDeals({ stores: [], signals: [{ ...signal, sourceUrl: "https://retailer.example/deal" }], giftCards: [], cashback: [], points: [], weekly: [], stackableMerchantIds: new Set() });
    expect(deal.sourceUrl).toBeNull();
  });

  it("never renders sample placeholder URLs as actions", () => {
    const [deal] = buildPublicDeals({ stores: [], signals: [{ ...signal, isSample: true }], giftCards: [], cashback: [], points: [], weekly: [], stackableMerchantIds: new Set() });
    expect(deal.sourceUrl).toBeNull();
  });

  it("decodes the supported feed entities and bounds explicit percentages", () => {
    expect(decodeEntities("A &lt; B &amp; C")).toBe("A < B & C");
    expect(deriveSavingPercent("100% off", 0, 100)).toBe(100);
  });
});
