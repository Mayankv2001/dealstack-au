import { describe, expect, it } from "vitest";
import { calculateStack, formatAUD } from "../../lib/calculateStack";

describe("calculateStack", () => {
  it("stacks discount → gift card → cashback in order", () => {
    const r = calculateStack({
      originalPrice: 200,
      discountPercent: 10,
      cashbackPercent: 5,
      giftCardDiscountPercent: 4,
    });
    expect(r.discountSaving).toBe(20); // 200 * 10%
    expect(r.checkoutPrice).toBe(180); // 200 - 20
    expect(r.giftCardSaving).toBe(7.2); // 180 * 4%
    expect(r.estimatedCashback).toBe(9); // 180 * 5%
    expect(r.finalEffectivePrice).toBe(163.8); // 180 - 7.2 - 9
    expect(r.totalSaving).toBe(36.2); // 200 - 163.8
    expect(r.totalSavingPercent).toBe(18.1); // 36.2 / 200
  });

  it("clamps percentages above 100 down to 100", () => {
    const r = calculateStack({
      originalPrice: 100,
      discountPercent: 150,
      cashbackPercent: 0,
      giftCardDiscountPercent: 0,
    });
    expect(r.discountSaving).toBe(100);
    expect(r.checkoutPrice).toBe(0);
    expect(r.finalEffectivePrice).toBe(0);
    expect(r.totalSavingPercent).toBe(100);
  });

  it("clamps negative percentages up to 0", () => {
    const r = calculateStack({
      originalPrice: 100,
      discountPercent: -25,
      cashbackPercent: -5,
      giftCardDiscountPercent: -1,
    });
    expect(r.discountSaving).toBe(0);
    expect(r.estimatedCashback).toBe(0);
    expect(r.giftCardSaving).toBe(0);
    expect(r.finalEffectivePrice).toBe(100);
    expect(r.totalSaving).toBe(0);
  });

  it("treats a zero / negative / non-finite price as no savings", () => {
    for (const price of [0, -50, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = calculateStack({
        originalPrice: price,
        discountPercent: 10,
        cashbackPercent: 5,
        giftCardDiscountPercent: 5,
      });
      expect(r.originalPrice).toBe(0);
      expect(r.totalSaving).toBe(0);
      expect(r.totalSavingPercent).toBe(0);
    }
  });

  it("rounds every dollar field to two decimals", () => {
    const r = calculateStack({
      originalPrice: 10,
      discountPercent: 0,
      cashbackPercent: 0,
      giftCardDiscountPercent: 33.333,
    });
    expect(r.giftCardSaving).toBe(3.33); // 10 * 33.333% = 3.3333 → 3.33
    expect(r.finalEffectivePrice).toBe(6.67); // 10 - 3.33(rounded base 3.3333) → 6.6667 → 6.67
  });

  it("chooses the stronger layer when cashback excludes gift-card payment", () => {
    const r = calculateStack({
      originalPrice: 500,
      discountPercent: 10,
      cashbackPercent: 6,
      giftCardDiscountPercent: 4,
      cashbackExcludesGiftCardPayment: true,
    });
    expect(r.checkoutPrice).toBe(450);
    expect(r.giftCardSaving).toBe(0);
    expect(r.estimatedCashback).toBe(27);
    expect(r.cashPaidForCheckout).toBe(450);
    expect(r.finalEffectivePrice).toBe(423);
    expect(r.excludedLayer).toBe("gift-card");
  });
});

describe("formatAUD", () => {
  it("formats a number as AUD currency", () => {
    expect(formatAUD(1234.5)).toBe("$1,234.50");
    expect(formatAUD(0)).toBe("$0.00");
  });
});
