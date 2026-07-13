import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  extractOffer,
  extractOffers,
} from "@/lib/giftcards/extractOffer";
import type { GcdbFeedItem } from "@/lib/giftcards/parseGcdbFeed";
import { parseGcdbFeed } from "@/lib/giftcards/parseGcdbFeed";

/**
 * Candidate extraction: one parsed feed item → normalised fields + confidence +
 * explicit warnings. The extractor must never invent rates/dates/programmes;
 * unknowns stay null and lower confidence. Output is staged for admin review.
 */

function item(overrides: Partial<GcdbFeedItem> = {}): GcdbFeedItem {
  return {
    externalId: "1",
    canonicalUrl: "https://gcdb.com.au/offer/1/",
    title: "",
    publishedAt: null,
    offerType: null,
    sellerName: null,
    giftCardBrands: [],
    startsAt: null,
    endsAt: null,
    isOngoing: false,
    sourceMarkedExpired: false,
    excerpt: "",
    ...overrides,
  };
}

describe("extractOffer — discount", () => {
  const result = extractOffer(
    item({
      title: "10% off Coles Group gift cards",
      offerType: "discount",
      sellerName: "Coles",
      giftCardBrands: ["Coles Group"],
      endsAt: "2026-07-17",
      excerpt: "Get 10% off. Ends 17 Jul 2026.",
    })
  );

  it("reads the discount percentage and classification", () => {
    expect(result.promotionType).toBe("discount");
    expect(result.discountPercent).toBe(10);
    expect(result.bonusPercent).toBeNull();
    expect(result.effectiveDiscountPercent).toBe(10);
  });

  it("scores full confidence with no warnings when every field is present", () => {
    expect(result.confidence).toBe(1);
    expect(result.warnings).toEqual([]);
  });
});

describe("extractOffer — bonus value is not read as a discount", () => {
  const result = extractOffer(
    item({
      title: "10% bonus value on Ultimate gift cards",
      sellerName: "Card.Gift",
      giftCardBrands: ["Ultimate"],
    })
  );

  it("classifies as bonus-value and uses the net-cost formula", () => {
    expect(result.promotionType).toBe("bonus-value");
    expect(result.bonusPercent).toBe(10);
    expect(result.discountPercent).toBeNull();
    expect(result.effectiveDiscountPercent).toBe(9.09);
  });

  it("warns about the missing end date", () => {
    expect(result.warnings).toContain("No end date found — confirm at the source.");
  });
});

describe("extractOffer — points", () => {
  const result = extractOffer(
    item({
      title: "20x Everyday Rewards points on Coles Mastercard gift cards",
      offerType: "points",
      sellerName: "Coles",
      giftCardBrands: ["Coles Mastercard"],
      endsAt: "2026-08-01",
    })
  );

  it("reads the multiplier and resolves the programme", () => {
    expect(result.promotionType).toBe("points");
    expect(result.pointsMultiplier).toBe(20);
    expect(result.pointsProgram).toBe("Everyday Rewards");
    expect(result.effectiveDiscountPercent).toBe(9.09);
  });
});

describe("extractOffer — reconciliation warnings", () => {
  it("warns when classified as a discount but no percentage is present", () => {
    const result = extractOffer(
      item({
        title: "Discount on Coles gift cards this week",
        offerType: "discount",
        sellerName: "Coles",
        giftCardBrands: ["Coles Group"],
        endsAt: "2026-07-20",
      })
    );
    expect(result.discountPercent).toBeNull();
    expect(result.warnings).toContain(
      "Classified as a discount but no percentage was found."
    );
    expect(result.warnings).toContain("No promotion value could be extracted.");
  });

  it("warns when a points multiplier is found but the programme is unclear", () => {
    const result = extractOffer(
      item({
        title: "15x points on selected gift cards",
        offerType: "points",
        sellerName: "Shop",
        giftCardBrands: ["Selected"],
        endsAt: "2026-07-20",
      })
    );
    expect(result.pointsMultiplier).toBe(15);
    expect(result.pointsProgram).toBeNull();
    expect(result.warnings).toContain(
      "Points multiplier found but the programme is unclear."
    );
  });
});

describe("extractOffer — conditions", () => {
  it("detects membership, activation, coupon, min spend and a limit note", () => {
    const result = extractOffer(
      item({
        title:
          "RACV members: 5% off gift cards, activate the boosted offer, use code SAVE, min spend $50, limit 5 per customer",
        sellerName: "RACV",
        giftCardBrands: ["Ultimate"],
        endsAt: "2026-07-31",
      })
    );
    expect(result.membershipRequired).toBe(true);
    expect(result.activationRequired).toBe(true);
    expect(result.couponRequired).toBe(true);
    expect(result.minSpend).toBe(50);
    expect(result.purchaseLimitNote).toContain("limit 5 per customer");
    // A concrete discount still wins the type over the membership signal.
    expect(result.promotionType).toBe("discount");
    expect(result.discountPercent).toBe(5);
  });

  it("falls back to a membership type when nothing else is quantifiable", () => {
    const result = extractOffer(
      item({
        title: "Members save on gift cards at the benefits portal",
        sellerName: "Union Shopper",
        giftCardBrands: ["Ultimate"],
      })
    );
    expect(result.membershipRequired).toBe(true);
    expect(result.promotionType).toBe("membership");
    expect(result.effectiveDiscountPercent).toBeNull();
  });

  it("lowers confidence and warns when seller, brand and value are all absent", () => {
    const result = extractOffer(item({ title: "A gift card offer" }));
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.warnings).toContain("No seller found in the source item.");
    expect(result.warnings).toContain("No gift-card brand found in the source item.");
  });
});

describe("extractOffers — Amazon-style compound campaign", () => {
  const amazon = item({
    externalId: "12680",
    canonicalUrl: "https://gcdb.com.au/offer/12680/",
    title: "$10 promo credit on $100 Apple and up to 10% off other gift cards",
    sellerName: "Amazon",
    giftCardBrands: ["Apple", "Uber & Uber Eats", "Amazon", "Activ Visa"],
    endsAt: "2026-07-13",
  });

  it("keeps a compact multi-mechanic source private until it is split", () => {
    const [summary] = extractOffers(amazon);
    expect(summary.promotionType).toBe("mixed");
    expect(summary.subOfferKey).toBe("compound-summary");
    expect(summary.parentIsCompound).toBe(true);
    expect(summary.warnings.join(" ")).toMatch(/split/i);
  });

  it("creates separately keyed candidates for each reviewed mechanic", () => {
    const children = extractOffers(amazon, [
      {
        key: "apple-credit",
        promotionType: "promo-credit",
        giftCardBrands: ["Apple"],
        promoCreditDollars: 10,
        thresholdDollars: 100,
        membershipRequired: true,
      },
      {
        key: "uber-discount",
        promotionType: "discount",
        giftCardBrands: ["Uber & Uber Eats"],
        discountPercent: 10,
        membershipRequired: true,
      },
      {
        key: "amazon-credit",
        promotionType: "promo-credit",
        giftCardBrands: ["Amazon"],
        promoCreditDollars: 10,
        thresholdDollars: 250,
        membershipRequired: true,
        activationRequired: true,
      },
      {
        key: "activ-visa-fee",
        promotionType: "fee-waiver",
        giftCardBrands: ["Activ Visa"],
        feeWaiverDollars: 4.95,
        thresholdDollars: 100,
        membershipRequired: true,
      },
    ]);
    expect(children.map((child) => child.subOfferKey)).toEqual([
      "apple-credit",
      "uber-discount",
      "amazon-credit",
      "activ-visa-fee",
    ]);
    expect(children.every((child) => child.parentIsCompound)).toBe(true);
    expect(children[0]).toMatchObject({
      promotionType: "promo-credit",
      promoCreditDollars: 10,
      thresholdDollars: 100,
      rewardDestination: "seller-credit",
    });
    expect(children[3]).toMatchObject({
      promotionType: "fee-waiver",
      rewardDestination: "waived-fee",
    });
  });

  it("rejects duplicate source child keys", () => {
    expect(() =>
      extractOffers(amazon, [
        { key: "same", promotionType: "discount", giftCardBrands: ["Apple"], discountPercent: 10 },
        { key: "same", promotionType: "discount", giftCardBrands: ["Uber"], discountPercent: 10 },
      ])
    ).toThrow(/unique/i);
  });
});

describe("sanitised real-feed extraction", () => {
  const parsed = parseFixture();

  function parseFixture(): GcdbFeedItem[] {
    const xml = readFileSync(
      new URL(
        "../fixtures/giftcards/gcdb-feed-2026-07-13-sanitised.xml",
        import.meta.url
      ),
      "utf8"
    );
    // Imported lazily below to keep the production-shaped fixture alongside
    // the extractor assertions that motivated it.
    return parseGcdbFeed(xml);
  }

  it("treats title-level bonus value as stronger evidence than a coarse Discount tag", () => {
    const myer = parsed.find((entry) => entry.externalId === "12844")!;
    expect(extractOffer(myer)).toMatchObject({
      promotionType: "bonus-value",
      bonusPercent: 10,
      discountPercent: null,
      effectiveDiscountPercent: 9.09,
    });
  });

  it("keeps the real Amazon item private as a compound summary", () => {
    const amazon = parsed.find((entry) => entry.externalId === "12680")!;
    expect(extractOffers(amazon)[0]).toMatchObject({
      promotionType: "mixed",
      parentIsCompound: true,
      subOfferKey: "compound-summary",
    });
  });
});
