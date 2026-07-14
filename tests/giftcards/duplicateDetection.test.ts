import { describe, expect, it } from "vitest";
import {
  findDuplicateOffers,
  type DedupCandidate,
  type PublishedOfferSummary,
} from "@/lib/giftcards/duplicateDetection";

const candidate = (
  overrides: Partial<DedupCandidate> = {}
): DedupCandidate => ({
  sellerName: "Woolworths",
  giftCardBrands: ["Apple"],
  promotionType: "points",
  discountPercent: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgram: "Everyday Rewards",
  denominationNote: "$50, $100",
  startsAt: "2026-07-15",
  expiresAt: "2026-07-21",
  sourceUrl: "https://gcdb.com.au/offer/12845/",
  ...overrides,
});

const published = (
  overrides: Partial<PublishedOfferSummary> = {}
): PublishedOfferSummary => ({
  id: "gc-apple-points",
  brand: "Apple",
  seller: "Woolworths supermarkets",
  promotionType: "points",
  discountPercent: null,
  bonusPercent: null,
  pointsMultiplier: 20,
  fixedPoints: null,
  pointsProgram: "Everyday Rewards",
  denominationNote: "$50, $100",
  startDate: "2026-07-15",
  expiryDate: "2026-07-21",
  sourceDetailUrl: "https://gcdb.com.au/offer/12845/",
  ...overrides,
});

describe("gift-card duplicate warnings", () => {
  it("detects the exact same offer-level source URL", () => {
    expect(findDuplicateOffers(candidate(), [published()])[0].verdict).toBe(
      "exact-duplicate"
    );
  });

  it("does not treat a generic source homepage as an exact identity", () => {
    const matches = findDuplicateOffers(
      candidate({ sourceUrl: "https://www.gcdb.com.au" }),
      [published({ sourceDetailUrl: "https://gcdb.com.au/" })]
    );
    expect(matches[0]?.verdict).not.toBe("exact-duplicate");
  });

  it("compares fixed points and does not confuse them with a multiplier", () => {
    const matches = findDuplicateOffers(
      candidate({
        sourceUrl: "https://example.com/new",
        pointsMultiplier: null,
        fixedPoints: 2000,
      }),
      [
        published({
          sourceDetailUrl: "https://example.com/old",
          pointsMultiplier: null,
          fixedPoints: 2000,
        }),
      ],
    );
    expect(matches[0]?.verdict).toBe("probable-duplicate");
  });

  it("warns about overlapping campaigns when recorded denominations differ", () => {
    const matches = findDuplicateOffers(
      candidate({ sourceUrl: "https://example.com/new", denominationNote: "$100" }),
      [published({ sourceDetailUrl: "https://example.com/old", denominationNote: "$50" })],
    );
    expect(matches[0]?.verdict).toBe("overlapping-campaign");
    expect(matches[0]?.reasons.join(" ")).toMatch(/denominations differ/i);
  });

  it("warns on same seller/brand/value/date from a different source", () => {
    const matches = findDuplicateOffers(
      candidate({ sourceUrl: "https://example.com/apple" }),
      [published({ sourceDetailUrl: "https://gcdb.com.au/offer/old/" })]
    );
    expect(matches[0].verdict).toBe("probable-duplicate");
  });

  it("classifies changed dates as an overlapping renewed campaign", () => {
    const matches = findDuplicateOffers(candidate(), [
      published({
        sourceDetailUrl: "https://gcdb.com.au/offer/old/",
        startDate: "2026-06-01",
        expiryDate: "2026-06-07",
      }),
    ]);
    expect(matches[0].verdict).toBe("overlapping-campaign");
  });

  it("identifies an expired predecessor without auto-rejecting", () => {
    const matches = findDuplicateOffers(candidate(), [
      published({
        sourceDetailUrl: "https://gcdb.com.au/offer/old/",
        expiryDate: "2026-07-07",
      }),
    ], "2026-07-13");
    expect(matches[0].verdict).toBe("overlapping-campaign");
    expect(matches[0].reasons.join(" ")).toMatch(/expired/i);
  });
});
