import { describe, expect, it } from "vitest";
import { analyseGiftCardStackability } from "@/lib/giftcards/stackability";
import type { CashbackOffer, GiftCardAcceptanceRow } from "@/lib/offers/types";
import { makeBareOffer, makeOffer, NOW } from "./offerFixture";

const acceptanceRow = (
  overrides: Partial<GiftCardAcceptanceRow> = {}
): GiftCardAcceptanceRow => ({
  id: "acc-1",
  productId: "tcn-shop",
  storeId: "jb-hifi",
  merchantName: "JB Hi-Fi",
  merchantCategory: "Electronics",
  mcc: 5732,
  status: "verified",
  outcome: "successful",
  sourceUrl: null,
  checkedAt: "2026-07-10T00:00:00Z",
  notes: null,
  acceptanceStatus: "confirmed-accepted",
  evidenceSourceType: "issuer-official",
  evidencePublisher: "The Card Network",
  evidenceUrl: "https://example.test/evidence",
  evidenceCapturedAt: "2026-07-10T00:00:00Z",
  lastCheckedAt: "2026-07-10T00:00:00Z",
  acceptsOnline: true,
  acceptsInStore: true,
  acceptsApp: null,
  acceptsPhone: null,
  validFrom: null,
  validUntil: null,
  limitations: null,
  region: "AU",
  participatingLocationRequired: null,
  ...overrides,
});

const cashback: CashbackOffer = {
  id: "cb-1",
  merchantId: "jb-hifi",
  provider: "ShopBack",
  ratePercent: 5,
  flatAmount: null,
  capDollars: null,
  isUpsized: false,
  excludesGiftCardPayment: true,
  termsSummary: "",
  expiryDate: null,
  citations: [],
  confidence: "confirmed",
  lastCheckedAt: "2026-07-12T00:00:00Z",
};

describe("acquisition vs redemption are analysed separately", () => {
  it("returns distinct stage verdicts with their own reasons", () => {
    const result = analyseGiftCardStackability(makeOffer(), { now: NOW });
    expect(result.acquisition.stage).toBe("acquisition");
    expect(result.redemption.stage).toBe("redemption");
    // Coupon-gated acquisition needs verification; unverified acceptance too —
    // but for DIFFERENT reasons.
    expect(result.acquisition.status).toBe("requires-verification");
    expect(result.acquisition.reason).toContain("promo code");
    expect(result.redemption.status).toBe("requires-verification");
    expect(result.redemption.reason).toContain("not independently verified");
  });

  it("an expired offer blocks acquisition, not the acceptance story", () => {
    const result = analyseGiftCardStackability(
      makeOffer({ expiryDate: "2026-07-01" }),
      { now: NOW }
    );
    expect(result.acquisition.status).toBe("incompatible");
    expect(result.redemption.status).not.toBe("incompatible");
  });
});

describe("acquisition stage", () => {
  it("surfaces the seller-promotion exclusion as a negative fact", () => {
    const { acquisition } = analyseGiftCardStackability(makeOffer(), { now: NOW });
    const fact = acquisition.facts.find((f) => f.label === "Seller promotions");
    expect(fact?.tone).toBe("negative");
    expect(fact?.value).toContain("Cannot be combined");
  });

  it("shows the promo code in the coupon fact when recorded", () => {
    const { acquisition } = analyseGiftCardStackability(makeOffer(), { now: NOW });
    const fact = acquisition.facts.find((f) => f.label === "Promo code");
    expect(fact?.value).toContain("FEELING10");
  });

  it("reports the purchase cap as a warning", () => {
    const { acquisition } = analyseGiftCardStackability(makeOffer(), { now: NOW });
    expect(acquisition.warnings.join(" ")).toContain("first $3,000");
  });

  it("never claims payment restrictions it has no data for", () => {
    const { acquisition } = analyseGiftCardStackability(makeOffer(), { now: NOW });
    const fact = acquisition.facts.find((f) => f.label === "Payment restrictions");
    expect(fact?.tone).toBe("neutral");
    expect(fact?.value).toContain("Not recorded");
  });

  it("discloses points as an estimate, never cash", () => {
    const { acquisition } = analyseGiftCardStackability(
      makeOffer({
        promotionType: "points",
        discountPercent: 0,
        couponRequired: false,
        promoCode: null,
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
      }),
      { now: NOW }
    );
    const fact = acquisition.facts.find((f) => f.label === "Points on purchase");
    expect(fact?.value).toContain("estimate, not cash");
    expect(acquisition.warnings.join(" ")).toContain("not guaranteed cash");
  });

  it("is insufficient-evidence when no value can be established", () => {
    const { acquisition } = analyseGiftCardStackability(
      makeBareOffer({ discountPercent: 0 }),
      { now: NOW }
    );
    expect(acquisition.status).toBe("insufficient-evidence");
  });

  it("is compatible only for confirmed offers with no conditions", () => {
    const clean = makeOffer({
      confidence: "confirmed",
      couponRequired: false,
      promoCode: null,
      capDollars: null,
      combinableWithSellerPromotions: true,
      usesPerCustomer: null,
    });
    const { acquisition } = analyseGiftCardStackability(clean, { now: NOW });
    expect(acquisition.status).toBe("compatible");
  });
});

describe("redemption stage", () => {
  it("is insufficient-evidence with no acceptance information at all", () => {
    const { redemption } = analyseGiftCardStackability(
      makeBareOffer({ acceptedAt: [] }),
      { now: NOW }
    );
    expect(redemption.status).toBe("insufficient-evidence");
  });

  it("upgrades to likely-compatible with verified acceptance evidence", () => {
    const { redemption } = analyseGiftCardStackability(makeOffer(), {
      now: NOW,
      acceptance: [acceptanceRow()],
    });
    expect(redemption.status).toBe("likely-compatible");
    const fact = redemption.facts.find((f) => f.label === "Store acceptance");
    expect(fact?.value).toContain("1 verified");
  });

  it("uses the exact cashback exclusion when the target offer is known", () => {
    const { redemption } = analyseGiftCardStackability(makeOffer(), {
      now: NOW,
      cashback,
    });
    const fact = redemption.facts.find((f) => f.label === "Cashback");
    expect(fact?.tone).toBe("negative");
  });

  it("falls back to a generic cashback caution otherwise", () => {
    const { redemption } = analyseGiftCardStackability(makeOffer(), { now: NOW });
    const fact = redemption.facts.find((f) => f.label === "Cashback");
    expect(fact?.tone).toBe("caution");
    expect(fact?.value).toContain("may not track when paying with gift cards");
  });

  it("is incompatible when the target store is not in the accepted list", () => {
    const { redemption } = analyseGiftCardStackability(
      makeOffer({ acceptedAtMerchantIds: ["jb-hifi"] }),
      { now: NOW, storeId: "chemist-warehouse", storeName: "Chemist Warehouse" }
    );
    expect(redemption.status).toBe("incompatible");
    expect(redemption.reason).toContain("Chemist Warehouse");
  });

  it("unsuccessful outcomes never count as verified acceptance", () => {
    const { redemption } = analyseGiftCardStackability(makeOffer(), {
      now: NOW,
      acceptance: [acceptanceRow({ outcome: "unsuccessful" })],
    });
    expect(redemption.status).toBe("incompatible");
  });
});

describe("store-acceptance retailer count", () => {
  it("dedupes merchant ids against their display names and pluralises correctly", () => {
    // "jb-hifi" and "JB Hi-Fi" are the same retailer — the old code counted 5
    // here (2 ids + 3 names) while the page listed 3 retailers.
    const analysis = analyseGiftCardStackability(
      makeOffer({
        acceptedAtMerchantIds: ["jb-hifi", "the-good-guys"],
        acceptedAt: ["JB Hi-Fi", "The Good Guys", "many Ultimate-network retailers"],
      }),
      { now: NOW }
    );
    const fact = analysis.redemption.facts.find((f) => f.label === "Store acceptance");
    expect(fact?.value).toContain("3 listed retailers");
    expect(fact?.value).not.toContain("retailer(s)");
  });

  it("uses the singular for a single listed retailer", () => {
    const analysis = analyseGiftCardStackability(
      makeOffer({ acceptedAtMerchantIds: ["myer"], acceptedAt: ["Myer"] }),
      { now: NOW }
    );
    const fact = analysis.redemption.facts.find((f) => f.label === "Store acceptance");
    expect(fact?.value).toContain("1 listed retailer");
    expect(fact?.value).not.toContain("retailers");
  });
});
