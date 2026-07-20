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

describe("extractOffer — stock-limited availability", () => {
  it("propagates while-stocks-last honestly instead of inventing an expiry", () => {
    const result = extractOffer(
      item({
        title: "10% off Ultimate gift cards",
        offerType: "discount",
        sellerName: "Giftz.com.au",
        giftCardBrands: ["Ultimate Everyone"],
        whileStocksLast: true,
        excerpt: "Get 10% off, while stocks last.",
      })
    );
    expect(result.whileStocksLast).toBe(true);
    expect(result.expiresAt).toBeNull();
    expect(result.isOngoing).toBe(false);
    expect(result.warnings).toContain(
      "Availability is stock-limited (while stocks last) — no fixed end date at the source."
    );
    expect(result.warnings).not.toContain(
      "No end date found — confirm at the source."
    );
  });

  it("keeps the explicit end date when the offer is also stock-limited", () => {
    const result = extractOffer(
      item({
        title: "10% off Ultimate gift cards",
        offerType: "discount",
        sellerName: "Giftz.com.au",
        giftCardBrands: ["Ultimate Everyone"],
        whileStocksLast: true,
        endsAt: "2026-07-09",
        excerpt: "Get 10% off. Ends 9 Jul 2026, while stocks last.",
      })
    );
    expect(result.expiresAt).toBe("2026-07-09");
    expect(result.whileStocksLast).toBe(true);
  });
});

describe("extractOffer — explicit source date states", () => {
  it("carries a source-marked-expired item through for review, never as current", () => {
    const result = extractOffer(
      item({
        title: "10% off selected cards",
        offerType: "discount",
        sellerName: "Coles",
        giftCardBrands: ["Restaurant Choice"],
        endsAt: "2026-07-09",
        sourceMarkedExpired: true,
        excerpt: "Expired 9 Jul 2026.",
      })
    );
    expect(result.sourceMarkedExpired).toBe(true);
    expect(result.expiresAt).toBe("2026-07-09");
  });

  it("keeps a future-start promotion's dates without altering them", () => {
    const result = extractOffer(
      item({
        title: "20x points on Apple gift cards",
        offerType: "points",
        sellerName: "Woolworths",
        giftCardBrands: ["Apple"],
        startsAt: "2026-07-15",
        endsAt: "2026-07-21",
        excerpt: "20x Everyday Rewards points. 15 Jul to 21 Jul 2026.",
      })
    );
    expect(result.startsAt).toBe("2026-07-15");
    expect(result.expiresAt).toBe("2026-07-21");
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
      "Points value found but the programme is unclear."
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

describe("extractOffer — GCDB 12943 (fixed Flybuys award, verified 2026-07-20)", () => {
  const result = extractOffer(
    item({
      externalId: "12943",
      canonicalUrl: "https://gcdb.com.au/offer/12943/",
      title: "1,000 bonus Flybuys points on selected TCN gift cards at Coles",
      offerType: "points",
      sellerName: "Coles",
      giftCardBrands: [
        "TCN Party",
        "TCN Teen",
        "TCN Her",
        "TCN Restaurant",
        "TCN Eftpos",
      ],
      startsAt: "2026-07-22",
      endsAt: "2026-07-28",
      excerpt:
        "Earn 1,000 bonus Flybuys points per eligible gift card in-store at Coles. Limit of five eligible gift cards per Flybuys account. No activation required. Starts 22 Jul 2026. Ends 28 Jul 2026.",
    }),
  );

  it("parses as a FIXED points award — not a discount, not a multiplier", () => {
    expect(result.promotionType).toBe("points");
    expect(result.fixedPoints).toBe(1000);
    expect(result.pointsMultiplier).toBeNull();
    expect(result.discountPercent).toBeNull();
    expect(result.bonusPercent).toBeNull();
    expect(result.pointsProgram).toBe("Flybuys");
  });

  it("keeps the promotion window and the stated limit as evidence", () => {
    expect(result.startsAt).toBe("2026-07-22");
    expect(result.expiresAt).toBe("2026-07-28");
    expect(result.purchaseLimitNote).toMatch(/five eligible gift cards/i);
  });

  it("reads 'No activation required' as NOT requiring activation", () => {
    expect(result.activationRequired).toBe(false);
  });

  it("extracts with full confidence and no warnings", () => {
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe(1);
  });

  it("values the fixed award per card, never scaled by spend", () => {
    // 1,000 Flybuys at the disclosed 0.5c/pt = $5 on a $100 face default.
    expect(result.effectiveDiscountPercent).toBeCloseTo(4.76, 2);
  });
});

describe("extractOffer — GCDB 12944 (10x Everyday Rewards, verified 2026-07-20)", () => {
  const result = extractOffer(
    item({
      externalId: "12944",
      canonicalUrl: "https://gcdb.com.au/offer/12944/",
      title:
        "10x Everyday Rewards points on Restaurant Choice, Cafe Choice and selected Ultimate gift cards at Woolworths",
      offerType: "points",
      sellerName: "Woolworths",
      giftCardBrands: ["Restaurant Choice", "Cafe Choice", "Ultimate"],
      startsAt: "2026-07-22",
      endsAt: "2026-07-28",
      excerpt:
        "Earn 10x Everyday Rewards points in-store. Limit of five fixed-value cards and two variable-load cards per day. Starts 22 Jul 2026. Ends 28 Jul 2026.",
    }),
  );

  it("parses as a points MULTIPLIER — not a discount, not a fixed award", () => {
    expect(result.promotionType).toBe("points");
    expect(result.pointsMultiplier).toBe(10);
    expect(result.fixedPoints).toBeNull();
    expect(result.discountPercent).toBeNull();
    expect(result.pointsProgram).toBe("Everyday Rewards");
  });

  it("keeps the window, the limits prose and full confidence", () => {
    expect(result.startsAt).toBe("2026-07-22");
    expect(result.expiresAt).toBe("2026-07-28");
    expect(result.purchaseLimitNote).toMatch(/five fixed-value cards/i);
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe(1);
  });

  it("carries no editorial verdict fields — value facts only", () => {
    // GCDB editorialises this as a "bad offer"; DealStack imports the 10x
    // fact and nothing else. The extractor output simply has nowhere for
    // editorial prose to live beyond the bounded factual fields asserted here.
    expect(Object.values(result).join(" ")).not.toMatch(/bad offer|not recommended/i);
  });
});

// The two describe blocks above use idealised titles. These pin the extractor
// against the EXACT titles the LIVE GCDB RSS feed carried on 2026-07-21, where
// the excerpt is only a bare date range ("22 Jul to 28 Jul 2026") — so every
// mechanic fact must come from the title alone.
describe("extractOffer — live GCDB feed titles (regression pins for v5)", () => {
  it("12943: reads a fixed award from '1,000 Flybuys points on …' (no 'bonus' word)", () => {
    const result = extractOffer(
      item({
        externalId: "12943",
        canonicalUrl: "https://gcdb.com.au/offer/12943/",
        title:
          "1,000 Flybuys points on $25 TCN Party (JB Hi-Fi) and selected other gift cards at Coles",
        offerType: "points",
        sellerName: "Coles",
        giftCardBrands: ["TCN Party", "TCN Teen", "TCN Her", "TCN Restaurant", "TCN Eftpos"],
        startsAt: "2026-07-22",
        endsAt: "2026-07-28",
        excerpt: "22 Jul to 28 Jul 2026",
      }),
    );
    expect(result.promotionType).toBe("points");
    expect(result.fixedPoints).toBe(1000);
    expect(result.pointsMultiplier).toBeNull();
    expect(result.pointsProgram).toBe("Flybuys");
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe(1);
  });

  it("12944: reads the 'EDR' abbreviation as Everyday Rewards and ignores the 'Bad offer:' prefix", () => {
    const result = extractOffer(
      item({
        externalId: "12944",
        canonicalUrl: "https://gcdb.com.au/offer/12944/",
        title:
          "Bad offer: 10x EDR points on Restaurant Choice, Cafe Choice and Ultimate gift cards at Woolworths",
        offerType: "points",
        sellerName: "Woolworths",
        giftCardBrands: ["Restaurant Choice", "Cafe Choice", "Ultimate"],
        startsAt: "2026-07-22",
        endsAt: "2026-07-28",
        excerpt: "22 Jul to 28 Jul 2026",
      }),
    );
    expect(result.promotionType).toBe("points");
    expect(result.pointsMultiplier).toBe(10);
    expect(result.fixedPoints).toBeNull();
    expect(result.pointsProgram).toBe("Everyday Rewards");
    expect(result.warnings).toEqual([]);
    expect(result.confidence).toBe(1);
  });

  it("does not fabricate a fixed award from a bare number with no programme name", () => {
    const result = extractOffer(
      item({
        externalId: "generic",
        canonicalUrl: "https://gcdb.com.au/offer/1/",
        title: "1,000 members save on 500 gift cards at Coles",
        offerType: "unknown",
        sellerName: "Coles",
        giftCardBrands: ["Some Brand"],
      }),
    );
    // "500 gift cards" and "1,000 members" must never read as a points award.
    expect(result.fixedPoints).toBeNull();
    expect(result.promotionType).not.toBe("points");
  });
});
