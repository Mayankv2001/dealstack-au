import { describe, expect, it } from "vitest";
import type { GiftCardProduct } from "@/lib/offers/types";
import { buildOfferWorkedExampleRows } from "@/lib/giftcards/offerWorkedExamples";
import { buildWorkedExample } from "@/lib/giftcards/value";
import { makeOffer } from "./offerFixture";

/**
 * Per-denomination worked examples — the GCDB-12943 shape: 1,000 fixed
 * Flybuys points per eligible card across TCN products whose denominations
 * differ, with real purchase fees on the eftpos cards. The table must make
 * the honest comparison visible: the $25 card wins, the fee-bearing eftpos
 * cards can be a net loss, and points never reduce cash paid.
 */

function product(overrides: Partial<GiftCardProduct> & { id: string; brand: string }): GiftCardProduct {
  return {
    slug: overrides.id,
    issuer: "TCN",
    cardNetwork: "closed-loop",
    format: "physical",
    variableLoad: false,
    minDenomination: null,
    maxDenomination: null,
    categoryRestricted: false,
    supportedMccs: [],
    unsupportedMccs: [],
    mobileWallet: "unknown",
    redemptionNotes: null,
    aliases: [],
    officialProductPage: null,
    activationMethod: null,
    onlineAvailable: null,
    inStoreAvailable: true,
    denominations: null,
    activationDelayNote: null,
    splitPayment: "unknown",
    expiryOrFeesNote: null,
    purchaseFees: null,
    ...overrides,
  };
}

/** GCDB 12943: 1,000 bonus Flybuys points per eligible card at Coles. */
const offer12943 = makeOffer({
  id: "gc-coles-tcn-flybuys-1000",
  brand: "TCN Party, TCN Teen, TCN Her, TCN Restaurant, TCN Eftpos",
  discountPercent: 0,
  promotionType: "points",
  fixedPoints: 1000,
  pointsProgram: "Flybuys",
  pointsMultiplier: null,
  productId: null,
  includedProductIds: [
    "tcn-party",
    "tcn-teen",
    "tcn-her",
    "tcn-restaurant",
    "tcn-eftpos",
  ],
  capDollars: null,
});

const products12943: GiftCardProduct[] = [
  product({ id: "tcn-party", brand: "TCN Party", denominations: [25, 40], purchaseFees: {} }),
  product({ id: "tcn-teen", brand: "TCN Teen", denominations: [50], purchaseFees: {} }),
  product({ id: "tcn-her", brand: "TCN Her", denominations: [50, 100], purchaseFees: {} }),
  product({ id: "tcn-restaurant", brand: "TCN Restaurant", denominations: [50, 100], purchaseFees: {} }),
  product({
    id: "tcn-eftpos",
    brand: "TCN Eftpos",
    denominations: [100, 200],
    purchaseFees: { "100": 5.95, "200": 7.95 },
  }),
];

describe("buildOfferWorkedExampleRows — GCDB 12943", () => {
  const rows = buildOfferWorkedExampleRows(offer12943, products12943);

  it("produces one row per included product denomination", () => {
    expect(rows).toHaveLength(9);
    expect(
      rows.map((row) => `${row.productName} $${row.denomination}`).sort(),
    ).toEqual([
      "TCN Eftpos $100",
      "TCN Eftpos $200",
      "TCN Her $100",
      "TCN Her $50",
      "TCN Party $25",
      "TCN Party $40",
      "TCN Restaurant $100",
      "TCN Restaurant $50",
      "TCN Teen $50",
    ].sort());
  });

  it("preserves each eftpos denomination's fee separately", () => {
    const eftpos100 = rows.find(
      (row) => row.productId === "tcn-eftpos" && row.denomination === 100,
    )!;
    const eftpos200 = rows.find(
      (row) => row.productId === "tcn-eftpos" && row.denomination === 200,
    )!;
    expect(eftpos100.purchaseFeeDollars).toBe(5.95);
    expect(eftpos200.purchaseFeeDollars).toBe(7.95);
    expect(eftpos100.feeUnknown).toBe(false);
    // Fee is IN cash paid, points are NOT deducted from it.
    expect(eftpos100.example.cashPaid).toBe(105.95);
    expect(eftpos100.example.points).toBe(1000);
    expect(eftpos100.example.rewardValueDollars).toBe(5);
  });

  it("ranks the $25 card first: same 1,000 points, no fee, least cash", () => {
    expect(rows[0].productName).toBe("TCN Party");
    expect(rows[0].denomination).toBe(25);
    expect(rows[0].example.cashPaid).toBe(25);
    // 1,000 Flybuys at the disclosed 0.5c/pt = $5 estimated reward.
    expect(rows[0].netBenefitDollars).toBe(5);
  });

  it("shows fee-bearing eftpos cards as a net loss, never smoothed over", () => {
    const eftpos100 = rows.find(
      (row) => row.productId === "tcn-eftpos" && row.denomination === 100,
    )!;
    // $5 reward estimate − $5.95 fee = −$0.95.
    expect(eftpos100.netBenefitDollars).toBe(-0.95);
    // And they sort below every fee-free denomination.
    expect(rows.at(-1)!.productId).toBe("tcn-eftpos");
    expect(rows.at(-1)!.denomination).toBe(200);
  });

  it("never invents rows when products carry no denominations", () => {
    const rows = buildOfferWorkedExampleRows(offer12943, [
      product({ id: "tcn-party", brand: "TCN Party", denominations: null }),
    ]);
    expect(rows).toEqual([]);
  });

  it("marks unknown fees explicitly instead of assuming zero", () => {
    const rows = buildOfferWorkedExampleRows(offer12943, [
      product({
        id: "tcn-party",
        brand: "TCN Party",
        denominations: [25],
        purchaseFees: null,
      }),
    ]);
    expect(rows[0].feeUnknown).toBe(true);
    expect(rows[0].purchaseFeeDollars).toBe(0);
  });
});

describe("buildWorkedExample — purchase fee arithmetic", () => {
  it("adds the fee to cash paid and reports it separately", () => {
    const example = buildWorkedExample(
      {
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: null,
        fixedPoints: 1000,
        pointsProgram: "Flybuys",
        purchaseFeeDollars: 5.95,
      },
      100,
    )!;
    expect(example.cashPaid).toBe(105.95);
    expect(example.purchaseFeeDollars).toBe(5.95);
    expect(example.acquisitionSaving).toBe(-5.95);
    expect(example.rewardValueDollars).toBe(5);
    // Effective economic cost includes the fee: 105.95 − 5 = 100.95.
    expect(example.effectiveCost).toBe(100.95);
  });

  it("keeps fee-free behaviour identical (regression)", () => {
    const example = buildWorkedExample(
      { promotionType: "discount", discountPercent: 10, bonusPercent: null, pointsMultiplier: null, pointsProgram: null },
      100,
    )!;
    expect(example.cashPaid).toBe(90);
    expect(example.purchaseFeeDollars).toBe(0);
    expect(example.acquisitionSaving).toBe(10);
  });
});
