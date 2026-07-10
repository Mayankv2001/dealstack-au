import { describe, expect, it } from "vitest";
import { stores } from "@/lib/data";
import { guardStoreDiscount } from "@/lib/repos/stores";

const STORE = {
  ...stores[0],
  discountPercent: 15,
  discountCode: "SAVE15",
  expiryDate: "2026-07-10",
  cashbackPercent: 8,
  giftCardDiscountPercent: 4,
  pointsProgram: "Example Points",
};

describe("guardStoreDiscount", () => {
  it("keeps a discount live through its AU expiry date", () => {
    expect(guardStoreDiscount(STORE, "2026-07-10")).toBe(STORE);
  });

  it("suppresses only the expired discount layer the following day", () => {
    expect(guardStoreDiscount(STORE, "2026-07-11")).toMatchObject({
      discountPercent: 0,
      discountCode: "No current public code",
      expiryDate: null,
      cashbackPercent: 8,
      giftCardDiscountPercent: 4,
      pointsProgram: "Example Points",
    });
  });

  it("treats null expiry as evergreen", () => {
    const evergreen = { ...STORE, expiryDate: null };
    expect(guardStoreDiscount(evergreen, "2099-01-01")).toBe(evergreen);
  });

  it("follows the existing lexical policy for malformed dates", () => {
    const malformed = { ...STORE, expiryDate: "not-a-date" };
    expect(guardStoreDiscount(malformed, "2026-07-11")).toBe(malformed);
  });
});
