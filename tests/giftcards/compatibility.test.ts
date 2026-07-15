import { describe, expect, it } from "vitest";
import type { CashbackOffer, GiftCardOffer } from "@/lib/offers/types";
import {
  compatibilityStatusLabel,
  evaluateGiftCardCompatibility,
} from "@/lib/giftcards/compatibility";
import { makeGiftCardAcceptance, makeGiftCardProduct } from "../stack/factories";

/**
 * Structured compatibility verdicts. Confirms every branch of the 5-status
 * model, that each verdict carries a human-readable reason, and that the shared
 * caveats (expiry / stale / needs-verification / cashback exclusion) come
 * through unchanged from the stack engine's rule builders.
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
    expiryDate: "2027-01-01",
    startDate: "2026-06-01",
    promotionType: "discount",
    citations: [],
    confidence: "confirmed",
    lastCheckedAt: "2026-07-10T00:00:00Z",
    ...overrides,
  };
}

describe("evaluateGiftCardCompatibility — verdicts", () => {
  it("keeps offer-level acceptance at likely-compatible", () => {
    const r = evaluateGiftCardCompatibility(gc(), { now: NOW });
    expect(r.status).toBe("likely-compatible");
    expect(r.warnings).toEqual([]);
    expect(r.reason).toMatch(/stacking conditions still need checking/i);
  });

  it("likely-compatible: confirmed but a spend cap applies", () => {
    const r = evaluateGiftCardCompatibility(gc({ capDollars: 500 }), { now: NOW });
    expect(r.status).toBe("likely-compatible");
    expect(r.warnings.some((w) => w.includes("$500"))).toBe(true);
  });

  it("incompatible: the offer has already expired", () => {
    const r = evaluateGiftCardCompatibility(gc({ expiryDate: "2026-07-01" }), {
      now: NOW,
    });
    expect(r.status).toBe("incompatible");
    expect(r.reason).toMatch(/expired/i);
  });

  it("incompatible: not accepted at the target store", () => {
    const r = evaluateGiftCardCompatibility(gc({ acceptedAtMerchantIds: ["coles"] }), {
      now: NOW,
      storeId: "jbhifi",
      storeName: "JB Hi-Fi",
    });
    expect(r.status).toBe("incompatible");
    expect(r.reason).toContain("JB Hi-Fi");
  });

  it("requires-verification: membership/activation conditions", () => {
    const r = evaluateGiftCardCompatibility(
      gc({ membershipRequired: true, activationRequired: true }),
      { now: NOW }
    );
    expect(r.status).toBe("requires-verification");
    expect(r.reason).toContain("membership");
    expect(r.reason).toContain("activation");
  });

  it("requires-verification: unverified confidence with no hard conditions", () => {
    const r = evaluateGiftCardCompatibility(gc({ confidence: "needs-verification" }), {
      now: NOW,
    });
    expect(r.status).toBe("requires-verification");
    expect(r.warnings.some((w) => /unverified/i.test(w))).toBe(true);
  });

  it("insufficient-evidence: confidence is expired-unknown", () => {
    const r = evaluateGiftCardCompatibility(gc({ confidence: "expired-unknown" }), {
      now: NOW,
    });
    expect(r.status).toBe("insufficient-evidence");
  });

  it("insufficient-evidence: no promotion value can be established", () => {
    const r = evaluateGiftCardCompatibility(
      gc({ discountPercent: 0, promotionType: "discount", pointsOnPurchase: null }),
      { now: NOW }
    );
    expect(r.status).toBe("insufficient-evidence");
    expect(r.reason).toMatch(/no promotion value/i);
  });
});

describe("evaluateGiftCardCompatibility — shared caveats", () => {
  it("surfaces the cashback gift-card-payment exclusion via the shared rule", () => {
    const cashback = {
      provider: "ShopBack",
      excludesGiftCardPayment: true,
    } as CashbackOffer;
    const r = evaluateGiftCardCompatibility(gc(), {
      now: NOW,
      storeName: "Coles",
      cashback,
    });
    expect(r.warnings.some((w) => w.includes("ShopBack") && /gift card/i.test(w))).toBe(
      true
    );
  });

  it("flags points offers as an estimate, not guaranteed cash", () => {
    const r = evaluateGiftCardCompatibility(
      gc({
        discountPercent: 0,
        promotionType: "points",
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      }),
      { now: NOW }
    );
    expect(r.warnings.some((w) => /estimate, not guaranteed cash/i.test(w))).toBe(true);
    // A confirmed points offer with only the estimate caveat is "likely".
    expect(r.status).toBe("likely-compatible");
  });

  it("exposes a readable status label", () => {
    expect(compatibilityStatusLabel("requires-verification")).toBe(
      "Verify stacking"
    );
  });
});

describe("acceptance-derived compatibility boundaries", () => {
  it("never promotes a legacy offer merchant list alone to fully compatible", () => {
    const result = evaluateGiftCardCompatibility(gc(), {
      now: NOW,
      storeId: "coles",
      storeName: "Coles",
    });
    expect(result.status).toBe("likely-compatible");
  });

  it("never promotes acceptance alone to fully compatible", () => {
    const result = evaluateGiftCardCompatibility(gc({ acceptedAtMerchantIds: ["jbhifi"] }), {
      now: NOW,
      storeId: "jbhifi",
      storeName: "JB Hi-Fi",
      acceptance: makeGiftCardAcceptance({ storeId: "jbhifi", lastCheckedAt: "2026-07-10T00:00:00Z" }),
    });
    expect(result.status).toBe("likely-compatible");
    expect(result.reason).toContain("stacking conditions still need checking");
  });

  it("uses explicit online rejection but not an unknown channel", () => {
    const base = { now: NOW, storeId: "jbhifi", storeName: "JB Hi-Fi", redemptionChannel: "online" as const };
    const rejected = evaluateGiftCardCompatibility(gc({ acceptedAtMerchantIds: ["jbhifi"] }), {
      ...base,
      acceptance: makeGiftCardAcceptance({ storeId: "jbhifi", acceptsOnline: false, lastCheckedAt: "2026-07-10T00:00:00Z" }),
    });
    expect(rejected.status).toBe("incompatible");
    expect(rejected.reason).toContain("not accepted online");
    const unknown = evaluateGiftCardCompatibility(gc({ acceptedAtMerchantIds: ["jbhifi"] }), {
      ...base,
      acceptance: makeGiftCardAcceptance({ storeId: "jbhifi", acceptsOnline: null, lastCheckedAt: "2026-07-10T00:00:00Z" }),
    });
    expect(unknown.status).not.toBe("incompatible");
  });

  it("blocks an evidenced split-payment limit", () => {
    const result = evaluateGiftCardCompatibility(gc({ acceptedAtMerchantIds: ["jbhifi"] }), {
      now: NOW,
      storeId: "jbhifi",
      acceptance: makeGiftCardAcceptance({ storeId: "jbhifi", lastCheckedAt: "2026-07-10T00:00:00Z" }),
      product: makeGiftCardProduct({ splitPayment: "unsupported", maxDenomination: 100 }),
      purchaseAmount: 500,
    });
    expect(result.status).toBe("incompatible");
    expect(result.reason).toContain("split payment");
  });

  it("blocks an evidenced minimum spend and unsupported MCC", () => {
    const belowMinimum = evaluateGiftCardCompatibility(gc({ minSpend: 100 }), {
      now: NOW,
      purchaseAmount: 50,
    });
    expect(belowMinimum).toMatchObject({ status: "incompatible" });
    expect(belowMinimum.reason).toContain("$100 minimum");

    const unsupportedMcc = evaluateGiftCardCompatibility(gc(), {
      now: NOW,
      redemptionMcc: 5411,
      product: makeGiftCardProduct({ unsupportedMccs: [5411] }),
    });
    expect(unsupportedMcc).toMatchObject({ status: "incompatible" });
    expect(unsupportedMcc.reason).toContain("MCC 5411");
  });
});
