import { describe, expect, it } from "vitest";
import { normaliseFeedApprovalOverrides } from "@/lib/admin/repos/feedQueue";

describe("feed approval overrides", () => {
  it("normalises reviewer-edited metadata", () => {
    expect(
      normaliseFeedApprovalOverrides({
        merchantId: " jb-hifi ",
        dealKind: "discount-code",
        priceText: " $199 ",
        couponCode: " save20 ",
        expiryDate: "2026-12-31",
        score: 150,
      })
    ).toEqual({
      merchantId: "jb-hifi",
      dealKind: "discount-code",
      priceText: "$199",
      couponCode: "SAVE20",
      expiryDate: "2026-12-31",
      score: 150,
    });
  });

  it.each([
    [{ merchantId: "../admin" }, /Store id/],
    [{ couponCode: "bad code!" }, /Coupon/],
    [{ expiryDate: "2026-02-31" }, /Expiry/],
    [{ score: Number.NaN }, /Score/],
  ])("rejects unsafe reviewer input %#", (input, message) => {
    expect(() => normaliseFeedApprovalOverrides(input)).toThrow(message);
  });

  it("allows an explicit null to clear an inferred field", () => {
    expect(
      normaliseFeedApprovalOverrides({
        merchantId: null,
        priceText: "",
        couponCode: null,
        expiryDate: null,
        score: null,
      })
    ).toEqual({
      merchantId: null,
      priceText: null,
      couponCode: null,
      expiryDate: null,
      score: null,
    });
  });
});
