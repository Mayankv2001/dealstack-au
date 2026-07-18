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

const NOW = new Date("2026-07-18T12:00:00+10:00");

function build(
  data: ReturnType<typeof makeStackData>,
  input?: string,
  spend = 500
) {
  return buildStackRecommendations(input, spend, data, { now: NOW });
}

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
    const [rec] = build(data);
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
    const [rec] = build(data);
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
    const [rec] = build(data);
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
    expect(build(data)).toEqual([]);
  });

  it("filters to a single store when the input resolves to a merchant id", () => {
    const data = makeStackData({
      stores: [
        makeStore({ id: "myer", discountPercent: 10, discountCode: "M" }),
        makeStore({ id: "coles", name: "Coles", discountPercent: 5, discountCode: "C" }),
      ],
    });
    const recs = build(data, "coles");
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
    const recs = build(data);
    expect(recs.map((r) => r.merchantId)).toEqual(["myer", "coles"]);
  });

  it("treats points as informational — earned, valued, but not deducted", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      pointsOffers: [
        makePoints({ earnMultiple: 2, pointValueCents: 1, merchantId: "myer" }),
      ],
    });
    const [rec] = build(data);
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
    const [rec] = build(data);
    expect(rec.citations).toContainEqual({
      source: "ozbargain",
      sourceUrl: "https://example.com/s1",
    });
  });

  it("treats a gift-card cap as the eligible face-value cap", () => {
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
    const [rec] = build(data);
    const giftCard = rec.components.find((c) => c.layer === "gift-card");
    // min(500, 200) * 10% = 20.
    expect(giftCard?.valueDollars).toBe(20);
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(true);
  });

  it("treats a cashback cap as the maximum reward", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      cashbackOffers: [
        makeCashback({ ratePercent: 20, capDollars: 30, merchantId: "myer" }),
      ],
    });
    const [rec] = build(data);
    expect(rec.components.find((c) => c.layer === "cashback")?.valueDollars).toBe(
      30
    );
    expect(rec.warnings.some((w) => w.code === "cap-reached")).toBe(true);
  });

  it("uses a flat cashback amount when it is better represented than a rate", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      cashbackOffers: [
        makeCashback({ ratePercent: 0, flatAmount: 25, merchantId: "myer" }),
      ],
    });
    const [rec] = build(data);
    expect(rec.totalSaving).toBe(25);
    expect(rec.components[0].label).toContain("$25");
  });

  it("excludes expired and not-yet-started offers using Melbourne's date", () => {
    const data = makeStackData({
      stores: [makeStore({ id: "myer", discountPercent: 0 })],
      giftCardOffers: [
        makeGiftCard({ expiryDate: "2026-07-17" }),
        makeGiftCard({ id: "future", startDate: "2026-07-19" }),
      ],
      cashbackOffers: [makeCashback({ expiryDate: "2026-07-17" })],
      pointsOffers: [makePoints({ expiryDate: "2026-07-17" })],
    });
    expect(build(data)).toEqual([]);
  });

  it("derives the displayed week from the injected production clock", () => {
    const data = makeStackData({
      stores: [makeStore({ discountPercent: 10 })],
    });
    expect(build(data)[0].weekOf).toBe("2026-07-13");
  });
});
