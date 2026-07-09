import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "../../lib/stack/buildStack";
import {
  TEST_NOW,
  makeCashback,
  makeGiftCard,
  makePoints,
  makeSignal,
  makeStackData,
  makeStore,
} from "./factories";

describe("buildStackRecommendations", () => {
  it("stacks an uncapped gift card and cashback (no conflict)", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({ discountPercent: 5, acceptedAtMerchantIds: ["myer"] }),
      ],
      cashbackOffers: [
        makeCashback({ ratePercent: 4, excludesGiftCardPayment: false }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    // 500 → gift card 5% (25) → cashback 4% (20) → 455 out of pocket.
    expect(rec.effectivePrice).toBe(455);
    expect(rec.totalSaving).toBe(45);
    expect(rec.components.map((c) => c.layer)).toEqual(["gift-card", "cashback"]);
    expect(rec.components.every((c) => !c.optional)).toBe(true);
    expect(rec.confidence).toBe("confirmed");
    expect(rec.warnings).toEqual([]);
  });

  it("keeps the discount layer flagged needs-verification", () => {
    const data = makeStackData({
      stores: [makeStore({ discountPercent: 10, discountCode: "SAVE10" })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.effectivePrice).toBe(450); // 500 - 10%
    expect(rec.totalSaving).toBe(50);
    expect(rec.components[0].layer).toBe("discount");
    expect(rec.components[0].confidence).toBe("needs-verification");
    expect(rec.confidence).toBe("needs-verification");
  });

  it("resolves the gift-card/cashback conflict by keeping the larger saving", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({ discountPercent: 5, acceptedAtMerchantIds: ["myer"] }),
      ],
      cashbackOffers: [
        makeCashback({ ratePercent: 4, excludesGiftCardPayment: true }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");
    const cashback = rec.components.find((c) => c.layer === "cashback");
    // Gift card (5% = $25) beats cashback (4% = $20): gift card kept, cashback optional.
    expect(giftCard?.optional).toBe(false);
    expect(cashback?.optional).toBe(true);
    expect(rec.effectivePrice).toBe(475); // only the gift card is deducted
    const conflict = rec.warnings.find(
      (w) => w.code === "gift-card-excluded-from-cashback"
    );
    expect(conflict?.level).toBe("risk");
  });

  it("drops stores with no usable (non-optional) layer", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "empty", discountPercent: 0 })],
    });
    expect(buildStackRecommendations(undefined, 500, data, TEST_NOW)).toEqual([]);
  });

  it("filters to a single store when the input resolves to a merchant id", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "myer", discountPercent: 10, discountCode: "M" }),
        makeStore({ id: "coles", name: "Coles", discountPercent: 5, discountCode: "C" }),
      ],
    });
    const recs = buildStackRecommendations("coles", 500, data, TEST_NOW);
    expect(recs).toHaveLength(1);
    expect(recs[0].merchantId).toBe("coles");
  });

  it("sorts multiple recommendations by total saving (desc)", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "coles", name: "Coles", discountPercent: 5, discountCode: "C" }),
        makeStore({ id: "myer", discountPercent: 10, discountCode: "M" }),
      ],
    });
    const recs = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(recs.map((r) => r.merchantId)).toEqual(["myer", "coles"]);
  });

  it("treats points as informational — earned, valued, but not deducted", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      pointsOffers: [
        makePoints({ earnMultiple: 2, pointValueCents: 1, merchantId: "myer" }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.pointsEarned).toBe(1000); // 500 * 2
    expect(rec.pointsValueDollars).toBe(10); // 1000 points * 1c
    expect(rec.effectivePrice).toBe(500); // points are NOT subtracted
    expect(rec.totalSaving).toBe(0);
    expect(rec.components.some((c) => c.layer === "points")).toBe(true);
  });

  it("carries OzBargain signals through as citations only", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 10, discountCode: "M" })],
      ozBargainSignals: [
        makeSignal({ merchantId: "myer", sourceUrl: "https://example.com/s1" }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    expect(rec.citations).toContainEqual({
      source: "ozbargain",
      sourceUrl: "https://example.com/s1",
    });
  });

  it("drives expiry-soon and stale-data warnings off the injected clock", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({
          discountPercent: 5,
          acceptedAtMerchantIds: ["myer"],
          // 45 days before TEST_NOW (> STALE_DATA_DAYS) → stale at TEST_NOW.
          lastCheckedAt: "2026-05-01T00:00:00+10:00",
          // 3 days after TEST_NOW (< EXPIRY_SOON_DAYS) → expiry-soon at TEST_NOW.
          expiryDate: "2026-06-18",
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const codes = rec.warnings.map((w) => w.code);
    expect(codes).toContain("expiry-soon");
    expect(codes).toContain("stale-data");

    // Same fixtures, a clock inside both thresholds → neither warning fires.
    // 14 days after lastCheckedAt (not yet stale); 34 days before expiry.
    const early = new Date("2026-05-15T00:00:00+10:00");
    const [recEarly] = buildStackRecommendations(undefined, 500, data, early);
    const earlyCodes = recEarly.warnings.map((w) => w.code);
    expect(earlyCodes).not.toContain("expiry-soon");
    expect(earlyCodes).not.toContain("stale-data");
  });

  // ─── Cap semantics: cashback caps the SAVING, gift-card caps the SPEND ───

  it("cashback cap binds: saving is capped at capDollars, not min(spend,cap)*pct", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      cashbackOffers: [makeCashback({ ratePercent: 10, capDollars: 25 })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const cashback = rec.components.find((c) => c.layer === "cashback");
    // raw = 500 * 10% = 50, capped at $25 (not min(500,25)*10% = 2.50).
    expect(cashback?.valueDollars).toBe(25);
    expect(rec.effectivePrice).toBe(475);
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(true);
  });

  it("cashback cap with slack: raw saving under the cap, no warning", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      cashbackOffers: [makeCashback({ ratePercent: 10, capDollars: 100 })],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const cashback = rec.components.find((c) => c.layer === "cashback");
    expect(cashback?.valueDollars).toBe(50);
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(false);
  });

  it("gift-card spend cap (behaviour preserved): caps the eligible spend, not the saving", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({
          discountPercent: 10,
          capDollars: 200,
          acceptedAtMerchantIds: ["myer"],
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");
    // min(500, 200) * 10% = 20 — unchanged from before this fix.
    expect(giftCard?.valueDollars).toBe(20);
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(true);
  });

  it("conflict resolution uses the corrected numbers: a capped cashback now competes on its true value", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({ discountPercent: 5, acceptedAtMerchantIds: ["myer"] }),
      ],
      cashbackOffers: [
        makeCashback({
          ratePercent: 10,
          capDollars: 30,
          excludesGiftCardPayment: true,
        }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data, TEST_NOW);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");
    const cashback = rec.components.find((c) => c.layer === "cashback");
    // Gift card: 5% uncapped = $25. Cashback: raw 10% = $50, capped at $30.
    // Under the old (pre-fix) maths cashback would have been min(500,30)*10% = $3
    // and lost to the gift card's $25 — this is the regression tripwire.
    expect(giftCard?.optional).toBe(true);
    expect(cashback?.optional).toBe(false);
    expect(rec.effectivePrice).toBe(470); // only the $30 cashback is deducted
  });
});
