import { describe, expect, it } from "vitest";
import { estimateFirstYearValue } from "@/lib/offers/cardValue";
import type { CardOffer } from "@/lib/offers/types";

function offer(overrides: Partial<CardOffer> = {}): CardOffer {
  return {
    id: "card-1",
    provider: "Example Bank",
    cardName: "Rewards Card",
    offerType: "points_bonus",
    bonusPoints: 110000,
    bonusStages: [
      {
        points: 80000,
        requirement: "Spend $5,000 in 90 days",
        timing: "Initial bonus",
        withinFirstYear: true,
      },
      {
        points: 30000,
        requirement: "Keep the card for 12 months",
        timing: "Anniversary bonus",
        withinFirstYear: false,
      },
    ],
    pointValueCents: 0.5,
    cashbackAmount: null,
    statementCreditAmount: null,
    minimumSpend: 5000,
    minimumSpendPeriod: "90 days",
    annualFee: 195,
    eligibilityNotes: "New customers only.",
    offerSummary: "Earn staged bonus points.",
    sourceUrl: "https://issuer.example/card",
    confidence: "confirmed",
    expiryDate: null,
    reviewByDate: "2026-08-10",
    lastCheckedAt: "2026-07-10T00:00:00+10:00",
    ...overrides,
  };
}

describe("estimateFirstYearValue", () => {
  it("excludes stages earned after the first year", () => {
    expect(estimateFirstYearValue(offer())).toEqual({
      firstYearPoints: 80000,
      pointsValue: 400,
      cashBenefits: 0,
      annualFee: 195,
      netValue: 205,
    });
  });

  it("adds cash benefits and subtracts the annual fee", () => {
    expect(
      estimateFirstYearValue(
        offer({
          bonusPoints: null,
          bonusStages: [],
          pointValueCents: null,
          cashbackAmount: 100,
          statementCreditAmount: 50,
          annualFee: 75,
        })
      ).netValue
    ).toBe(75);
  });

  it("does not fabricate a points valuation when no assumption exists", () => {
    expect(estimateFirstYearValue(offer({ pointValueCents: null })).netValue).toBeNull();
  });
});

