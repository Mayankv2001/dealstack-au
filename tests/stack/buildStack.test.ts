import { describe, expect, it } from "vitest";
import { buildStackRecommendations } from "../../lib/stack/buildStack";
import {
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
    const [rec] = buildStackRecommendations(undefined, 500, data);
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
    const [rec] = buildStackRecommendations(undefined, 500, data);
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
    const [rec] = buildStackRecommendations(undefined, 500, data);
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
    expect(buildStackRecommendations(undefined, 500, data)).toEqual([]);
  });

  it("filters to a single store when the input resolves to a merchant id", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "myer", discountPercent: 10, discountCode: "M" }),
        makeStore({ id: "coles", name: "Coles", discountPercent: 5, discountCode: "C" }),
      ],
    });
    const recs = buildStackRecommendations("coles", 500, data);
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
    const recs = buildStackRecommendations(undefined, 500, data);
    expect(recs.map((r) => r.merchantId)).toEqual(["myer", "coles"]);
  });

  it("treats points as informational — earned, valued, but not deducted", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      pointsOffers: [
        makePoints({ earnMultiple: 2, pointValueCents: 1, merchantId: "myer" }),
      ],
    });
    const [rec] = buildStackRecommendations(undefined, 500, data);
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
    const [rec] = buildStackRecommendations(undefined, 500, data);
    expect(rec.citations).toContainEqual({
      source: "ozbargain",
      sourceUrl: "https://example.com/s1",
    });
  });

  // CHARACTERIZATION TEST — documents CURRENT cap behavior, not necessarily the
  // intended one. `cappedSaving` computes min(base, cap) * pct, i.e. it treats
  // capDollars as a cap on the ELIGIBLE SPEND, while the admin form labels the
  // field as a "cashback cap" (a cap on the saving dollars). This mismatch is
  // flagged for a product decision; update this test if/when the semantics are
  // fixed.
  it("currently treats capDollars as an eligible-spend cap", () => {
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
    const [rec] = buildStackRecommendations(undefined, 500, data);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");
    // min(500, 200) * 10% = 20  (a "max $200 saving" reading would give $50).
    expect(giftCard?.valueDollars).toBe(20);
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(true);
  });
});
