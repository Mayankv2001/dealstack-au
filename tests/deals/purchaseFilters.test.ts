import { describe, expect, it } from "vitest";
import { buildPublicDeals } from "@/lib/deals/normalise";
import {
  DEFAULT_PARAMS,
  dealsHref,
  parseDealsParams,
} from "@/lib/deals/params";
import { matchDeals } from "@/lib/deals/query";
import {
  TEST_NOW,
  makeSignal,
  makeStore,
} from "../stack/factories";

/**
 * The purchase-first additions: category shortcut + price ceiling params, and
 * the price-text sanitisation that keeps development wording ("(sample)") off
 * the public list.
 */

describe("category and price params", () => {
  it("parses valid cat and maxPrice values", () => {
    const params = parseDealsParams({ cat: "laptops", maxPrice: "500" });
    expect(params.cat).toBe("laptops");
    expect(params.maxPrice).toBe(500);
  });

  it("rejects unknown categories and non-preset prices", () => {
    const params = parseDealsParams({ cat: "boats", maxPrice: "123" });
    expect(params.cat).toBeNull();
    expect(params.maxPrice).toBeNull();
  });

  it("round-trips through dealsHref", () => {
    const href = dealsHref(DEFAULT_PARAMS, { cat: "audio", maxPrice: 250 });
    expect(href).toContain("cat=audio");
    expect(href).toContain("maxPrice=250");
  });
});

function pool() {
  const stores = [makeStore({ id: "jb-hifi", name: "JB Hi-Fi" })];
  return buildPublicDeals(
    {
      stores,
      signals: [
        makeSignal({
          id: "sig-laptop",
          merchantId: "jb-hifi",
          title: "MacBook Air laptop price drop",
          priceText: "$1,799",
          tags: ["laptop"],
          expiryDate: "2026-07-30",
          sourceNativeId: "n1",
        }),
        makeSignal({
          id: "sig-headphones",
          merchantId: "jb-hifi",
          title: "Noise-cancelling headphones deal",
          priceText: "$129 (was $179)",
          tags: ["audio"],
          expiryDate: "2026-07-30",
          sourceNativeId: "n2",
        }),
        makeSignal({
          id: "sig-grocery",
          merchantId: "jb-hifi",
          title: "Half-price pantry staples",
          priceText: "½ price selected items (sample)",
          tags: ["groceries"],
          expiryDate: "2026-07-30",
          sourceNativeId: "n3",
        }),
      ],
      giftCards: [],
      cashback: [],
      points: [],
      weekly: [],
      stackableMerchantIds: new Set(["jb-hifi"]),
    },
    TEST_NOW,
  );
}

describe("category filtering", () => {
  it("keeps only deals matching the category keywords", () => {
    const matched = matchDeals(
      pool(),
      { ...DEFAULT_PARAMS, cat: "laptops" },
      TEST_NOW,
    );
    expect(matched.map((deal) => deal.id)).toEqual(["community:sig-laptop"]);
  });

  it("audio category finds the headphones deal", () => {
    const matched = matchDeals(
      pool(),
      { ...DEFAULT_PARAMS, cat: "audio" },
      TEST_NOW,
    );
    expect(matched.map((deal) => deal.id)).toEqual([
      "community:sig-headphones",
    ]);
  });
});

describe("price ceiling filtering", () => {
  it("keeps only priced deals at or below the ceiling", () => {
    const matched = matchDeals(
      pool(),
      { ...DEFAULT_PARAMS, maxPrice: 250 },
      TEST_NOW,
    );
    expect(matched.map((deal) => deal.id)).toEqual([
      "community:sig-headphones",
    ]);
  });

  it("excludes unpriced deals when a ceiling is set", () => {
    const matched = matchDeals(
      pool(),
      { ...DEFAULT_PARAMS, maxPrice: 2000 },
      TEST_NOW,
    );
    // The grocery signal has no parseable price and must not sneak through.
    expect(matched.map((deal) => deal.id).sort()).toEqual([
      "community:sig-headphones",
      "community:sig-laptop",
    ]);
  });
});

describe("public price text", () => {
  it("never leaks development wording into priceText", () => {
    const grocery = pool().find((deal) => deal.id === "community:sig-grocery");
    expect(grocery?.priceText).toBe("½ price selected items");
  });
});
