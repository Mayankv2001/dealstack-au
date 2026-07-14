import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decideWeeklyAutomatedRetrieval,
  extractPointHacksWeeklyOffer,
  parsePointHacksWeeklyPage,
  parseWeeklyAdminSubmission,
  parseWeeklyOfferPeriod,
  POINT_HACKS_WEEKLY_URL,
  weeklyFactsToSourceItem,
} from "@/lib/giftcards/pointHacksWeekly";

const fixture = readFileSync(
  new URL("../fixtures/giftcards/pointhacks-weekly-synthetic.html", import.meta.url),
  "utf8",
);

describe("Point Hacks weekly source permission", () => {
  const permitted = {
    sourceExists: true,
    enabled: true,
    automatedFetchAllowed: true,
    termsCheckedAt: "2026-07-14T00:00:00Z",
    robotsCheckedAt: "2026-07-14T00:00:00Z",
  };

  it("fails closed when the environment switch is disabled", () => {
    expect(decideWeeklyAutomatedRetrieval(false, permitted)).toEqual({
      allowed: false,
      reason: "environment-disabled",
    });
  });

  it("requires source existence, enablement, fetch permission and completed reviews", () => {
    expect(
      decideWeeklyAutomatedRetrieval(true, {
        ...permitted,
        automatedFetchAllowed: false,
      }),
    ).toEqual({ allowed: false, reason: "fetch-not-permitted" });
    expect(
      decideWeeklyAutomatedRetrieval(true, {
        ...permitted,
        termsCheckedAt: null,
      }),
    ).toEqual({
      allowed: false,
      reason: "permission-review-incomplete",
    });
    expect(decideWeeklyAutomatedRetrieval(true, permitted)).toEqual({
      allowed: true,
    });
  });
});

describe("Point Hacks weekly factual parser", () => {
  it("parses same-month and cross-month AU weekly periods", () => {
    expect(parseWeeklyOfferPeriod("15–21 July 2026")).toEqual({
      startDate: "2026-07-15",
      endDate: "2026-07-21",
    });
    expect(parseWeeklyOfferPeriod("30 June–6 July 2026")).toEqual({
      startDate: "2026-06-30",
      endDate: "2026-07-06",
    });
  });

  it("extracts weekly bonus-value and Everyday Rewards facts without article prose", () => {
    const facts = parsePointHacksWeeklyPage(fixture);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      weekIdentifier: "Week 29",
      startDate: "2026-07-15",
      endDate: "2026-07-21",
      seller: "Coles",
      promotionType: "bonus-value",
      bonusPercent: 10,
      giftCardBrands: ["Myer"],
      denominations: [50, 100],
      perMemberLimit: 5,
      excludedDenominations: [20],
    });
    expect(facts[0].retailerCatalogueUrl).toContain("coles.com.au");
    expect(facts[1]).toMatchObject({
      seller: "Woolworths",
      loyaltyProgramme: "Everyday Rewards",
      promotionType: "points",
      pointsMultiplier: 20,
      giftCardBrands: ["Apple"],
      variableLoadRange: { min: 20, max: 500 },
      perDayLimit: 2,
    });
    expect(JSON.stringify(facts)).not.toContain("recommend");
  });

  it("supports direct discounts, Flybuys multipliers and fixed points", () => {
    const common = `<h1>Week 30: 22–28 July 2026</h1>`;
    const direct = parsePointHacksWeeklyPage(
      `${common}<h2>10% off TCN gift cards at Coles</h2>`,
    )[0];
    const multiplier = parsePointHacksWeeklyPage(
      `${common}<h2>20x Flybuys points on Ultimate gift cards at Coles</h2>`,
    )[0];
    const fixed = parsePointHacksWeeklyPage(
      `${common}<h2>2,000 bonus Flybuys points on Apple gift cards at Coles</h2>`,
    )[0];
    expect(direct).toMatchObject({ promotionType: "discount", discountPercent: 10 });
    expect(multiplier).toMatchObject({
      promotionType: "points",
      pointsMultiplier: 20,
      loyaltyProgramme: "Flybuys",
    });
    expect(fixed).toMatchObject({
      promotionType: "fixed-points",
      fixedPoints: 2000,
      loyaltyProgramme: "Flybuys",
    });
    const fixedCandidate = extractPointHacksWeeklyOffer(
      weeklyFactsToSourceItem(fixed),
    )[0];
    expect(fixedCandidate).toMatchObject({
      promotionType: "points",
      pointsMultiplier: null,
      fixedPoints: 2000,
      pointsProgram: "Flybuys",
    });
  });

  it("normalises facts into a private candidate with no publication state", () => {
    const facts = parsePointHacksWeeklyPage(fixture)[0];
    const item = weeklyFactsToSourceItem(facts);
    const [candidate] = extractPointHacksWeeklyOffer(item);
    expect(candidate).toMatchObject({
      sellerName: "Coles",
      promotionType: "bonus-value",
      bonusPercent: 10,
      startsAt: "2026-07-15",
      expiresAt: "2026-07-21",
      membershipRequired: false,
    });
    expect(candidate).not.toHaveProperty("isPublished");
  });
});

describe("admin-assisted weekly submission", () => {
  const base = {
    seller: "Coles",
    discoverySourceUrl: POINT_HACKS_WEEKLY_URL,
    startDate: "2026-07-15",
    endDate: "2026-07-21",
    giftCardBrands: "Myer",
    promotionType: "bonus-value",
    bonusPercent: "10",
    loyaltyProgramme: "Flybuys",
  };

  it("accepts structured facts and retains limits, ranges and exclusions", () => {
    const result = parseWeeklyAdminSubmission({
      ...base,
      variableLoadMin: "20",
      variableLoadMax: "500",
      perMemberLimit: "5",
      perDayLimit: "2",
      excludedDenominations: "20, 500",
      excludedCardVariants: "Business card",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.facts).toMatchObject({
        variableLoadRange: { min: 20, max: 500 },
        perMemberLimit: 5,
        perDayLimit: 2,
        excludedDenominations: [20, 500],
        excludedCardVariants: ["Business card"],
      });
    }
  });

  it("rejects a non-canonical discovery URL and points without a programme", () => {
    expect(
      parseWeeklyAdminSubmission({
        ...base,
        discoverySourceUrl: "https://example.com/article",
      }),
    ).toMatchObject({ ok: false });
    expect(
      parseWeeklyAdminSubmission({
        ...base,
        promotionType: "points",
        pointsMultiplier: "20",
        loyaltyProgramme: "",
      }),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/programme/i) });
  });
});
