import { describe, expect, it } from "vitest";
import { parseOfferSplitDefinitions } from "@/lib/giftcards/offerRevision";

describe("offer revision split definitions", () => {
  it("accepts two explicit atomic mechanics without inferring values", () => {
    const result = parseOfferSplitDefinitions(JSON.stringify([
      { subOfferKey: "apple-credit", brand: "Apple", promotionType: "promo-credit", promoCreditDollars: 10, thresholdDollars: 100 },
      { subOfferKey: "uber-discount", brand: "Uber", promotionType: "discount", discountPercent: 10 },
    ]));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.parts.map((part) => part.subOfferKey)).toEqual(["apple-credit", "uber-discount"]);
  });

  it("blocks duplicate keys, compound mechanics and incomplete point values", () => {
    expect(parseOfferSplitDefinitions("not json")).toMatchObject({ ok: false });
    expect(parseOfferSplitDefinitions(JSON.stringify([
      { subOfferKey: "same", brand: "A", promotionType: "discount", discountPercent: 10 },
      { subOfferKey: "same", brand: "B", promotionType: "mixed", discountPercent: 10 },
    ]))).toMatchObject({ ok: false });
    expect(parseOfferSplitDefinitions(JSON.stringify([
      { subOfferKey: "a-points", brand: "A", promotionType: "points", pointsMultiplier: 20 },
      { subOfferKey: "b-discount", brand: "B", promotionType: "discount", discountPercent: 10 },
    ]))).toMatchObject({ ok: false });
  });
});
