import { describe, expect, it } from "vitest";
import type { GiftCardOffer } from "@/lib/offers/types";
import {
  GC_DEFAULTS,
  giftCardHref,
  isMultiRetailer,
  offerEffectiveSaving,
  parseGiftCardParams,
  queryGiftCardOffers,
} from "@/lib/giftcards/publicQuery";

/**
 * Pure URL-state + filter/sort layer for the public /gift-cards page, over the
 * ALREADY-APPROVED offers. Tested offline; no I/O.
 */

const NOW = new Date("2026-07-12T00:00:00Z"); // AEST → today is 2026-07-12

function gc(overrides: Partial<GiftCardOffer> = {}): GiftCardOffer {
  return {
    id: "gc-1",
    brand: "Coles Group",
    discountPercent: 10,
    channel: "supermarket-promo",
    source: "GCDB",
    acceptedAtMerchantIds: ["coles"],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: "2026-07-20",
    startDate: "2026-07-01",
    promotionType: "discount",
    citations: [],
    confidence: "needs-verification",
    lastCheckedAt: "2026-07-11T00:00:00Z",
    ...overrides,
  };
}

describe("parseGiftCardParams", () => {
  it("falls back to defaults for empty input", () => {
    expect(parseGiftCardParams({})).toEqual(GC_DEFAULTS);
  });

  it("accepts known tabs/sorts and ignores unknown ones", () => {
    expect(
      parseGiftCardParams({ tab: "points", sort: "saving" }),
    ).toMatchObject({
      tab: "points",
      sort: "saving",
    });
    expect(parseGiftCardParams({ tab: "bogus", sort: "bogus" })).toMatchObject({
      tab: "all",
      sort: "recommended",
    });
  });

  it("parses boolean and bounded numeric filters", () => {
    expect(
      parseGiftCardParams({ membership: "1", minSave: "5" }),
    ).toMatchObject({
      membership: true,
      minSave: 5,
    });
    // Out-of-range minSave is ignored.
    expect(parseGiftCardParams({ minSave: "150" }).minSave).toBeNull();
    expect(parseGiftCardParams({ minSave: "0" }).minSave).toBeNull();
  });
});

describe("giftCardHref", () => {
  it("omits defaults and only serialises non-default state", () => {
    expect(giftCardHref(GC_DEFAULTS)).toBe("/gift-cards");
    expect(giftCardHref(GC_DEFAULTS, { tab: "points", minSave: 5 })).toBe(
      "/gift-cards?tab=points&minSave=5",
    );
  });
});

describe("offerEffectiveSaving", () => {
  it("returns the shared valuation per promotion type", () => {
    expect(offerEffectiveSaving(gc({ discountPercent: 12 }))).toBe(12);
    expect(
      offerEffectiveSaving(
        gc({
          discountPercent: 0,
          promotionType: "bonus-value",
          bonusPercent: 10,
        }),
      ),
    ).toBe(9.09);
    expect(
      offerEffectiveSaving(
        gc({
          discountPercent: 0,
          promotionType: "points",
          pointsMultiplier: 20,
          pointsProgram: "Everyday Rewards",
        }),
      ),
    ).toBe(9.09);
  });
});

describe("isMultiRetailer", () => {
  it("is true with more than one merchant id or three+ display names", () => {
    expect(isMultiRetailer(gc({ acceptedAtMerchantIds: ["a", "b"] }))).toBe(
      true,
    );
    expect(
      isMultiRetailer(
        gc({ acceptedAtMerchantIds: ["a"], acceptedAt: ["X", "Y", "Z"] }),
      ),
    ).toBe(true);
    expect(isMultiRetailer(gc({ acceptedAtMerchantIds: ["a"] }))).toBe(false);
  });
});

describe("queryGiftCardOffers — filtering", () => {
  it("drops hard-expired offers regardless of tab", () => {
    const offers = [
      gc({ id: "live", expiryDate: "2026-07-20" }),
      gc({ id: "expired", expiryDate: "2026-07-01" }),
    ];
    const result = queryGiftCardOffers(offers, GC_DEFAULTS, NOW);
    expect(result.map((o) => o.id)).toEqual(["live"]);
  });

  it("filters by promotion tab", () => {
    const offers = [
      gc({ id: "disc", discountPercent: 10, promotionType: "discount" }),
      gc({
        id: "pts",
        discountPercent: 0,
        promotionType: "points",
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      }),
    ];
    const points = queryGiftCardOffers(
      offers,
      { ...GC_DEFAULTS, tab: "points" },
      NOW,
    );
    expect(points.map((o) => o.id)).toEqual(["pts"]);
  });

  it("matches free-text search across brand and acceptance", () => {
    const offers = [
      gc({ id: "coles", brand: "Coles Group", acceptedAt: ["Coles"] }),
      gc({ id: "myer", brand: "Myer", acceptedAt: ["Myer"] }),
    ];
    const result = queryGiftCardOffers(
      offers,
      { ...GC_DEFAULTS, q: "myer" },
      NOW,
    );
    expect(result.map((o) => o.id)).toEqual(["myer"]);
  });

  it("applies the minimum-saving filter", () => {
    const offers = [
      gc({ id: "big", discountPercent: 12 }),
      gc({ id: "small", discountPercent: 3 }),
    ];
    const result = queryGiftCardOffers(
      offers,
      { ...GC_DEFAULTS, minSave: 5 },
      NOW,
    );
    expect(result.map((o) => o.id)).toEqual(["big"]);
  });

  it("excludes unknown-date offers by default but keeps them available for research", () => {
    const offers = [
      gc({ id: "dated", expiryDate: "2026-07-20" }),
      gc({
        id: "unknown",
        expiryDate: null,
        isOngoing: false,
        discountPercent: 40,
      }),
      gc({
        id: "ongoing",
        expiryDate: null,
        isOngoing: true,
        discountPercent: 2,
      }),
    ];
    expect(
      queryGiftCardOffers(offers, GC_DEFAULTS, NOW).map((offer) => offer.id),
    ).toEqual(["dated", "ongoing"]);
    expect(
      queryGiftCardOffers(
        offers,
        { ...GC_DEFAULTS, confirmedCurrentOnly: false },
        NOW,
      ).map((offer) => offer.id),
    ).toEqual(["dated", "ongoing", "unknown"]);
  });

  it("never treats an unknown date as expiring", () => {
    const result = queryGiftCardOffers(
      [gc({ id: "unknown", expiryDate: null, isOngoing: false })],
      { ...GC_DEFAULTS, tab: "expiring", confirmedCurrentOnly: false },
      NOW,
    );
    expect(result).toEqual([]);
  });
});

describe("queryGiftCardOffers — sorting", () => {
  it("sorts by highest effective saving", () => {
    const offers = [
      gc({ id: "low", discountPercent: 4 }),
      gc({ id: "high", discountPercent: 15 }),
      gc({ id: "mid", discountPercent: 9 }),
    ];
    const result = queryGiftCardOffers(
      offers,
      { ...GC_DEFAULTS, sort: "saving" },
      NOW,
    );
    expect(result.map((o) => o.id)).toEqual(["high", "mid", "low"]);
  });

  it("sorts by soonest expiry", () => {
    const offers = [
      gc({ id: "late", expiryDate: "2026-07-30" }),
      gc({ id: "soon", expiryDate: "2026-07-14" }),
      gc({ id: "evergreen", expiryDate: null }),
    ];
    const result = queryGiftCardOffers(
      offers,
      { ...GC_DEFAULTS, sort: "expiring", confirmedCurrentOnly: false },
      NOW,
    );
    expect(result.map((o) => o.id)).toEqual(["soon", "late", "evergreen"]);
  });
});
