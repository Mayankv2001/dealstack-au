import { describe, expect, it } from "vitest";
import { buildWorkedExample } from "@/lib/giftcards/value";

describe("buildWorkedExample", () => {
  const discount = {
    promotionType: "discount",
    discountPercent: 10,
    bonusPercent: null,
    pointsMultiplier: null,
    pointsProgram: null,
    capDollars: 3000,
  };

  it("works a straight discount at $100", () => {
    const ex = buildWorkedExample(discount, 100)!;
    expect(ex.coveredFaceValue).toBe(100);
    expect(ex.cashPaid).toBe(90);
    expect(ex.acquisitionSaving).toBe(10);
    expect(ex.totalSpendingPower).toBe(100);
    expect(ex.effectiveCost).toBe(90);
    expect(ex.uncoveredFaceValue).toBe(0);
    expect(ex.points).toBeNull();
  });

  it("honours the purchase cap and reports the uncovered remainder", () => {
    const ex = buildWorkedExample({ ...discount, capDollars: 3000 }, 5000)!;
    expect(ex.coveredFaceValue).toBe(3000);
    expect(ex.uncoveredFaceValue).toBe(2000);
    expect(ex.acquisitionSaving).toBe(300);
  });

  it("keeps points strictly out of the cash saving", () => {
    const ex = buildWorkedExample(
      {
        promotionType: "points",
        discountPercent: null,
        bonusPercent: null,
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
        capDollars: null,
      },
      100
    )!;
    expect(ex.cashPaid).toBe(100); // full price paid
    expect(ex.acquisitionSaving).toBe(0); // NO cash saving claimed
    expect(ex.points).toBe(2000);
    expect(ex.rewardValueDollars).toBe(10); // 0.5c/pt disclosed default
    expect(ex.effectiveCost).toBe(90); // economics, separately labelled
    expect(ex.totalSpendingPower).toBe(100); // points don't inflate power
  });

  it("treats bonus value as spending power, not a cash discount", () => {
    const ex = buildWorkedExample(
      {
        promotionType: "bonus-value",
        discountPercent: null,
        bonusPercent: 10,
        pointsMultiplier: null,
        pointsProgram: null,
        capDollars: null,
      },
      100
    )!;
    expect(ex.cashPaid).toBe(100);
    expect(ex.acquisitionSaving).toBe(0);
    expect(ex.bonusValueDollars).toBe(10);
    expect(ex.totalSpendingPower).toBe(110);
  });

  it("returns null rather than a hollow example", () => {
    expect(
      buildWorkedExample(
        {
          promotionType: "membership",
          discountPercent: null,
          bonusPercent: null,
          pointsMultiplier: null,
          pointsProgram: null,
        },
        100
      )
    ).toBeNull();
    expect(buildWorkedExample(discount, 0)).toBeNull();
    expect(buildWorkedExample(discount, -5)).toBeNull();
  });
});
