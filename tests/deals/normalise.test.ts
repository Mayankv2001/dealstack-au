import { describe, expect, it } from "vitest";
import {
  buildPublicDeals,
  decodeEntities,
  deriveSavingPercent,
  tidyPriceText,
} from "@/lib/deals/normalise";
import { stackableChipLabel } from "@/lib/deals/types";
import { normaliseSourceId, type SourceId } from "@/lib/sources/types";
import type { OzBargainSignal } from "@/lib/offers/types";
import { makeGiftCard } from "../stack/factories";

const signal: OzBargainSignal = {
  id: "sig-1",
  sourceNativeId: "ozb:1",
  merchantId: null,
  title: "Headphones &amp; case",
  summary: "Community price",
  votesSample: 5,
  sentiment: "neutral",
  dealKind: "discount-code",
  sourceUrl: "https://www.ozbargain.com.au/node/1",
  postedAt: "2026-07-12T01:00:00Z",
  confidence: "needs-verification",
  lastCheckedAt: "2026-07-12T02:00:00Z",
  isSample: false,
  status: "approved",
  priceText: "$80 (was $100)",
  expiryDate: "2026-07-13",
};

describe("public deal normalisation", () => {
  it("survives citations whose source is a legacy display name", () => {
    // Prod regression: admin evidence-attach stored "Gift Card Database"
    // instead of the "gcdb" SourceId, crashing publisherFamilyFor.
    const [deal] = buildPublicDeals(
      {
        stores: [],
        signals: [],
        giftCards: [
          makeGiftCard({
            citations: [
              {
                source: "Gift Card Database" as unknown as SourceId,
                sourceUrl: "https://www.gcdb.com.au/offer",
              },
            ],
          }),
        ],
        cashback: [],
        points: [],
        weekly: [],
        stackableMerchantIds: new Set(),
      },
      new Date("2026-07-12T12:00:00+10:00"),
    );
    expect(deal.publisherFamily).toBe("dealstack");
  });

  it("normalises legacy source names and ids to SourceIds", () => {
    expect(normaliseSourceId("gcdb")).toBe("gcdb");
    expect(normaliseSourceId("Gift Card Database")).toBe("gcdb");
    expect(normaliseSourceId("Point Hacks")).toBe("pointhacks");
    expect(normaliseSourceId("DealStack record")).toBe("manual");
    expect(normaliseSourceId("unheard-of blog")).toBeNull();
    expect(normaliseSourceId(null)).toBeNull();
  });

  it("keeps approved community content honestly community-reported", () => {
    const [deal] = buildPublicDeals(
      {
        stores: [],
        signals: [signal],
        giftCards: [],
        cashback: [],
        points: [],
        weekly: [],
        stackableMerchantIds: new Set(),
      },
      new Date("2026-07-12T12:00:00+10:00"),
    );
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
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [
        {
          ...signal,
          productUrl: "https://retailer.example/product",
          merchantUrl: "https://retailer.example",
        },
      ],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.sourceUrl).toBe("https://www.ozbargain.com.au/node/1");
  });

  it("does not present a non-OzBargain URL as an OzBargain discussion", () => {
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [{ ...signal, sourceUrl: "https://retailer.example/deal" }],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.sourceUrl).toBeNull();
  });

  it("never renders sample placeholder URLs as actions", () => {
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [{ ...signal, isSample: true }],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.sourceUrl).toBeNull();
  });

  it("never exposes a known placeholder domain from a non-sample public record", () => {
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [{ ...signal, sourceUrl: "https://example.com/node/1" }],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.sourceUrl).toBeNull();
  });

  it("decodes the supported feed entities and bounds explicit percentages", () => {
    expect(decodeEntities("A &lt; B &amp; C")).toBe("A < B & C");
    expect(deriveSavingPercent("100% off", 0, 100)).toBe(100);
  });
});

describe("tidyPriceText", () => {
  it("strips the dangling comma a feed snippet leaves after the first price", () => {
    expect(tidyPriceText("$395,")).toBe("$395");
  });

  it("keeps a clean price untouched and nulls out empty leftovers", () => {
    expect(tidyPriceText("$69.99")).toBe("$69.99");
    expect(tidyPriceText("  ,")).toBeNull();
    expect(tidyPriceText(null)).toBeNull();
  });

  it("is applied to community deals end-to-end", () => {
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [{ ...signal, priceText: "$395," }],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.priceText).toBe("$395");
  });
});

describe("stackableChipLabel", () => {
  it("distinguishes merchant-level stackability from an actual stack layer", () => {
    expect(stackableChipLabel("community")).toBe("Stackable store");
    expect(stackableChipLabel("editorial")).toBe("Stackable store");
    expect(stackableChipLabel("gift-card")).toBe("Stack layer");
    expect(stackableChipLabel("cashback")).toBe("Stack layer");
    expect(stackableChipLabel("points")).toBe("Stack layer");
  });
});

describe("gift-card deal titles from seeded earn notes", () => {
  it("never renders an orphaned ' — : ' when the earn note carried a dev prefix", () => {
    const [deal] = buildPublicDeals({
      stores: [],
      signals: [],
      giftCards: [
        {
          id: "gc-colon",
          brand: "Coles Group",
          discountPercent: 0,
          channel: "supermarket-promo",
          source: "Coles in-store promo",
          acceptedAtMerchantIds: [],
          pointsOnPurchase: {
            program: "Flybuys",
            earnNote:
              "Sample: 2,000 bonus Flybuys when you buy $100+ in Coles Group gift cards",
          },
          capDollars: null,
          expiryDate: null,
          startDate: null,
          citations: [],
          confidence: "needs-verification",
          lastCheckedAt: "2026-07-12T00:00:00Z",
        },
      ],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(),
    });
    expect(deal.title).not.toContain("— :");
    expect(deal.title).toContain(
      "Coles Group gift cards — 2,000 bonus Flybuys",
    );
  });
});
