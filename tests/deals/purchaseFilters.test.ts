import { describe, expect, it } from "vitest";
import { buildPublicDeals } from "@/lib/deals/normalise";
import {
  DEFAULT_PARAMS,
  dealsHref,
  parseDealsParams,
} from "@/lib/deals/params";
import { matchDeals } from "@/lib/deals/query";
import { TEST_NOW, makeGiftCard, makeStore } from "../stack/factories";

/**
 * The purchase-first additions: the category shortcut param and the category
 * keyword filter over the public deal list.
 */

describe("category params", () => {
  it("parses a valid cat value", () => {
    const params = parseDealsParams({ cat: "laptops" });
    expect(params.cat).toBe("laptops");
  });

  it("rejects unknown categories", () => {
    const params = parseDealsParams({ cat: "boats" });
    expect(params.cat).toBeNull();
  });

  it("round-trips through dealsHref", () => {
    const href = dealsHref(DEFAULT_PARAMS, { cat: "audio" });
    expect(href).toContain("cat=audio");
  });
});

function pool() {
  const stores = [makeStore({ id: "jb-hifi", name: "JB Hi-Fi" })];
  return buildPublicDeals(
    {
      stores,
      giftCards: [
        makeGiftCard({
          id: "gc-laptop",
          brand: "MacBook Air laptop store credit",
          acceptedAtMerchantIds: ["jb-hifi"],
        }),
        makeGiftCard({
          id: "gc-headphones",
          brand: "Noise-cancelling headphones audio credit",
          acceptedAtMerchantIds: ["jb-hifi"],
        }),
      ],
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
    expect(matched.map((deal) => deal.id)).toEqual(["gift-card:gc-laptop"]);
  });

  it("audio category finds the headphones deal", () => {
    const matched = matchDeals(
      pool(),
      { ...DEFAULT_PARAMS, cat: "audio" },
      TEST_NOW,
    );
    expect(matched.map((deal) => deal.id)).toEqual(["gift-card:gc-headphones"]);
  });
});
