import { describe, expect, it } from "vitest";
import { deriveFeedItemMetadata } from "@/lib/admin/feedItemMetadata";

describe("deriveFeedItemMetadata", () => {
  it("extracts the moderation fields used by display, filters and approval", () => {
    const result = deriveFeedItemMetadata({
      rawTitle: "Samsung Watch $589 (35% off) @ JB Hi-Fi with code WATCH35",
      rawSummary: "Ends 2026-07-15 - 120 votes",
      categories: ["Electronics", "Samsung"],
    });
    expect(result).toMatchObject({
      brands: ["Samsung"],
      merchantId: "jb-hifi",
      merchantName: "JB Hi-Fi",
      priceText: "$589",
      discountText: "35% off",
      discountValue: 35,
      couponCode: "WATCH35",
      expiryDate: "2026-07-15",
      score: 120,
      dealKind: "discount-code",
    });
  });

  it("does not infer a brand from title text without a trusted brand tag", () => {
    expect(
      deriveFeedItemMetadata({
        rawTitle: "Samsung television clearance",
        rawSummary: "",
        categories: ["Electronics"],
      }).brands
    ).toEqual([]);
  });

  it("recognises supported cashback providers", () => {
    expect(
      deriveFeedItemMetadata({
        rawTitle: "27% Cashback at Estee Lauder via TopCashback",
        rawSummary: "",
        categories: [],
      })
    ).toMatchObject({
      cashbackProvider: "TopCashback",
      cashbackText: "27% cashback",
      dealKind: "cashback",
    });
  });

  it("leaves uncertain metadata null rather than inventing values", () => {
    expect(
      deriveFeedItemMetadata({
        rawTitle: "Weekend deal roundup",
        rawSummary: "Several offers may be available",
        categories: [],
      })
    ).toMatchObject({
      merchantId: null,
      priceText: null,
      discountText: null,
      expiryDate: null,
      score: null,
    });
  });

  it("rejects an impossible inferred expiry date", () => {
    expect(
      deriveFeedItemMetadata({
        rawTitle: "Deal expires 2026-02-31",
        rawSummary: "",
        categories: [],
      }).expiryDate
    ).toBeNull();
  });

  it("does not mistake discount or minimum-spend amounts for product prices", () => {
    expect(
      deriveFeedItemMetadata({
        rawTitle: "$20 off $200+ spend at Woolworths",
        rawSummary: "",
        categories: [],
      }).priceText
    ).toBeNull();
    expect(
      deriveFeedItemMetadata({
        rawTitle: "$40 Cashback on prepaid plan $149 delivered",
        rawSummary: "",
        categories: [],
      }).priceText
    ).toBe("$149");
  });
});
