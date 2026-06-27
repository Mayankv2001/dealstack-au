import { describe, expect, it } from "vitest";
import type { Store } from "@/lib/data";
import type { OzBargainSignal } from "@/lib/offers/types";
import type { StackData } from "@/lib/stack/buildStack";
import {
  buildSmartStackResults,
  parsePriceText,
} from "@/lib/stack/smartStack";

/**
 * Smart Stack unit tests.
 *
 * Pure: `buildSmartStackResults` takes an injected StackData bundle, so the
 * query→signal→stack synthesis is tested without any Supabase/network. Covers
 * the price parser, signal matching, the approved-only filter, and the
 * no-stackable-layer case (a store like Costco is listed, not synthesised).
 */

function store(partial: Partial<Store> & Pick<Store, "id" | "name">): Store {
  return {
    category: "Electronics",
    logo: partial.name.slice(0, 2).toUpperCase(),
    discountPercent: 0,
    discountCode: "—",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "—",
    giftCardDiscountPercent: 0,
    giftCardSource: "",
    pointsProgram: "—",
    pointsRate: "",
    ...partial,
  };
}

function signal(
  partial: Partial<OzBargainSignal> & Pick<OzBargainSignal, "id" | "title">
): OzBargainSignal {
  return {
    merchantId: null,
    summary: "",
    votesSample: 0,
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://example.com/node/1",
    postedAt: "2026-06-20",
    confidence: "needs-verification",
    lastCheckedAt: "2026-06-25T00:00:00+10:00",
    isSample: true,
    status: "approved",
    ...partial,
  };
}

const DATA: StackData = {
  stores: [
    // Has a discount layer → always yields a recommendation.
    store({ id: "jb-hifi", name: "JB Hi-Fi", discountPercent: 5, discountCode: "PERKS5" }),
    // No stackable layer → listed, never synthesised.
    store({ id: "costco", name: "Costco", category: "Warehouse Club" }),
  ],
  giftCardOffers: [],
  cashbackOffers: [],
  pointsOffers: [],
  ozBargainSignals: [
    signal({
      id: "sig-macbook-jb",
      merchantId: "jb-hifi",
      title: "MacBook Air M3 at JB Hi-Fi",
      tags: ["electronics", "macbook"],
      priceText: "$1,799 (was $2,199)",
      signalScore: 0.88,
    }),
    signal({
      id: "sig-macbook-costco",
      merchantId: "costco",
      title: "Costco Hot Buys: MacBook Air bundle",
      tags: ["costco", "hot-buys", "macbook"],
      priceText: "$1,749 member price",
      signalScore: 0.8,
    }),
    signal({
      id: "sig-pending",
      merchantId: "jb-hifi",
      title: "MacBook pending review",
      tags: ["macbook"],
      priceText: "$1,000",
      status: "pending",
    }),
  ],
};

describe("parsePriceText", () => {
  it("reads the first dollar amount, ignoring commas and trailing text", () => {
    expect(parsePriceText("$1,799 (was $2,199)")).toBe(1799);
    expect(parsePriceText("$795 member price")).toBe(795);
    expect(parsePriceText("$249 ($60 instant saving)")).toBe(249);
    expect(parsePriceText("$12.50")).toBe(12.5);
  });

  it("returns null when there is no usable price", () => {
    expect(parsePriceText("½ price selected items")).toBeNull();
    expect(parsePriceText(null)).toBeNull();
    expect(parsePriceText(undefined)).toBeNull();
    expect(parsePriceText("$0")).toBeNull();
  });
});

describe("buildSmartStackResults", () => {
  it("returns nothing for an empty query", () => {
    expect(buildSmartStackResults("", DATA)).toEqual([]);
    expect(buildSmartStackResults("   ", DATA)).toEqual([]);
  });

  it("synthesises a stack at the signal price for a store with stackable layers", () => {
    const results = buildSmartStackResults("macbook", DATA);
    const jb = results.find((r) => r.signal.id === "sig-macbook-jb");
    expect(jb).toBeDefined();
    expect(jb?.signalPrice).toBe(1799);
    expect(jb?.recommendation).not.toBeNull();
    // Stack is built against the signal's own price, not the default $500.
    expect(jb?.recommendation?.basePrice).toBe(1799);
    expect(jb?.recommendation?.merchantId).toBe("jb-hifi");
  });

  it("lists a matching signal even when its store has no stackable layer", () => {
    const results = buildSmartStackResults("macbook", DATA);
    const costco = results.find((r) => r.signal.id === "sig-macbook-costco");
    expect(costco).toBeDefined();
    expect(costco?.recommendation).toBeNull();
  });

  it("ranks results with a real stack ahead of those without", () => {
    const results = buildSmartStackResults("macbook", DATA);
    // Only the two approved signals match; the stacked one comes first.
    expect(results[0].signal.id).toBe("sig-macbook-jb");
  });

  it("ignores signals that are not approved", () => {
    const results = buildSmartStackResults("macbook", DATA);
    expect(results.some((r) => r.signal.id === "sig-pending")).toBe(false);
  });

  it("returns nothing when no signal matches the query", () => {
    expect(buildSmartStackResults("refrigerator", DATA)).toEqual([]);
  });
});
