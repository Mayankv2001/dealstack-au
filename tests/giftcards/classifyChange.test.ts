import { describe, expect, it } from "vitest";
import { classifyOfferChange } from "@/lib/giftcards/classifyChange";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";

/**
 * Change classification decides whether a re-ingested item is cosmetic noise
 * or a material change that must send an approved offer back to review. Getting
 * this wrong either spams the queue or lets a stale offer stay public, so the
 * boundaries are pinned exactly here.
 */

function offer(overrides: Partial<ExtractedOffer> = {}): ExtractedOffer {
  return {
    promotionType: "discount",
    sellerName: "Coles",
    giftCardBrands: ["Coles Group"],
    discountPercent: 10,
    bonusPercent: null,
    pointsMultiplier: null,
    pointsProgram: null,
    effectiveDiscountPercent: 10,
    startsAt: null,
    expiresAt: "2026-07-17",
    membershipRequired: false,
    activationRequired: false,
    couponRequired: false,
    minSpend: null,
    purchaseLimitNote: null,
    confidence: 1,
    warnings: [],
    ...overrides,
  };
}

describe("classifyOfferChange", () => {
  it("treats an identical re-extraction as cosmetic and skips review", () => {
    const c = classifyOfferChange(offer(), offer());
    expect(c.kind).toBe("cosmetic");
    expect(c.requiresReview).toBe(false);
    expect(c.changedFields).toEqual([]);
  });

  it("flags a changed discount rate as a material offer change", () => {
    const c = classifyOfferChange(offer(), offer({ discountPercent: 12, effectiveDiscountPercent: 12 }));
    expect(c.kind).toBe("material-offer");
    expect(c.requiresReview).toBe(true);
    expect(c.changedFields).toContain("discountPercent");
  });

  it("flags a seller change as material", () => {
    const c = classifyOfferChange(offer(), offer({ sellerName: "Woolworths" }));
    expect(c.kind).toBe("material-offer");
    expect(c.requiresReview).toBe(true);
  });

  it("treats a LATER expiry as an extension (still needs review to confirm)", () => {
    const c = classifyOfferChange(offer(), offer({ expiresAt: "2026-08-17" }));
    expect(c.kind).toBe("expiry-extension");
    expect(c.requiresReview).toBe(true);
  });

  it("treats an EARLIER or removed expiry as material (may already have ended)", () => {
    expect(classifyOfferChange(offer(), offer({ expiresAt: "2026-07-01" })).kind).toBe(
      "material-offer"
    );
    expect(classifyOfferChange(offer(), offer({ expiresAt: null })).kind).toBe(
      "material-offer"
    );
  });

  it("classifies stacking-relevant condition changes", () => {
    const c = classifyOfferChange(offer(), offer({ membershipRequired: true }));
    expect(c.kind).toBe("stacking-condition");
    expect(c.requiresReview).toBe(true);
    expect(c.changedFields).toContain("membershipRequired");
  });

  it("classifies a brand-coverage change as eligibility", () => {
    const c = classifyOfferChange(
      offer(),
      offer({ giftCardBrands: ["Coles Group", "Myer"] })
    );
    expect(c.kind).toBe("eligibility");
    expect(c.requiresReview).toBe(true);
  });

  it("treats a start-date-only change as non-material (no re-review)", () => {
    const c = classifyOfferChange(offer(), offer({ startsAt: "2026-07-10" }));
    expect(c.kind).toBe("factual-non-material");
    expect(c.requiresReview).toBe(false);
    expect(c.changedFields).toEqual(["startsAt"]);
  });

  it("treats disappearance from the source as removal", () => {
    const c = classifyOfferChange(offer(), null);
    expect(c.kind).toBe("source-removed");
    expect(c.requiresReview).toBe(true);
  });

  it("ignores brand ordering (sorted comparison)", () => {
    const c = classifyOfferChange(
      offer({ giftCardBrands: ["A", "B"] }),
      offer({ giftCardBrands: ["B", "A"] })
    );
    expect(c.kind).toBe("cosmetic");
    expect(c.changedFields).not.toContain("giftCardBrands");
  });
});
