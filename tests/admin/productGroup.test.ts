import { describe, expect, it } from "vitest";
import {
  isValidProductGroup,
  parseProductGroup,
  productGroupReadinessError,
} from "@/lib/offers/productGroup";

describe("product group validation", () => {
  it("accepts exact lowercase kebab-case keys and blank as ungrouped", () => {
    expect(parseProductGroup("airpods-pro-3")).toEqual({
      ok: true,
      value: "airpods-pro-3",
    });
    expect(parseProductGroup("  ")).toEqual({ ok: true, value: null });
  });

  it("rejects ambiguous or oversized keys", () => {
    expect(isValidProductGroup("AirPods-Pro-3")).toBe(false);
    expect(isValidProductGroup("airpods--pro")).toBe(false);
    expect(isValidProductGroup("airpods pro")).toBe(false);
    expect(isValidProductGroup("a".repeat(81))).toBe(false);
  });
});

describe("product group readiness", () => {
  const ready = {
    productGroup: "airpods-pro-3",
    merchantId: "jb-hifi",
    productUrl: "https://www.jbhifi.com.au/products/airpods-pro-3",
    priceText: "$399",
  };

  it("requires retailer identity, a direct product link and a price", () => {
    expect(productGroupReadinessError(ready)).toBeNull();
    expect(
      productGroupReadinessError({ ...ready, merchantId: null })
    ).toMatch(/Choose a store/);
    expect(
      productGroupReadinessError({ ...ready, productUrl: null })
    ).toMatch(/exact product URL/);
    expect(
      productGroupReadinessError({ ...ready, priceText: "Member special" })
    ).toMatch(/parseable AUD price/);
  });

  it("does not constrain standalone signals", () => {
    expect(
      productGroupReadinessError({
        productGroup: null,
        merchantId: null,
        productUrl: null,
        priceText: null,
      })
    ).toBeNull();
  });
});
