import { describe, expect, it } from "vitest";
import {
  cardOfferPublishErrorMessage,
  cardOfferReadiness,
  isPublicReadyCardOffer,
  type CardOfferReadinessInput,
} from "@/lib/offers/cardReadiness";

const TODAY = "2026-07-10";

function readyOffer(
  overrides: Partial<CardOfferReadinessInput> = {}
): CardOfferReadinessInput {
  return {
    provider: "Example Bank",
    cardName: "Qantas Premier Platinum",
    offerType: "sign_up_bonus",
    bonusPoints: 80000,
    cashbackAmount: null,
    statementCreditAmount: null,
    annualFee: 249,
    eligibilityNotes: "New primary cardholders who meet the issuer's criteria.",
    offerSummary: "Earn bonus points after meeting the minimum spend.",
    sourceUrl: "https://www.issuer.example/cards/qantas-premier",
    confidence: "confirmed",
    expiryDate: "2026-07-10",
    reviewByDate: "2026-07-10",
    ...overrides,
  };
}

describe("cardOfferReadiness", () => {
  it("accepts an offer through the end of its AU expiry day", () => {
    expect(cardOfferReadiness(readyOffer(), TODAY)).toEqual({ ready: true });
    expect(isPublicReadyCardOffer(readyOffer(), TODAY)).toBe(true);
  });

  it("rejects blank public identity fields", () => {
    expect(
      cardOfferReadiness(readyOffer({ provider: " ", cardName: "" }), TODAY)
    ).toEqual({
      ready: false,
      reasons: ["provider/bank is required", "card name is required"],
    });
  });

  it("returns every publication failure in stable, actionable order", () => {
    const offer = readyOffer({
      confidence: "needs-verification",
      expiryDate: null,
      reviewByDate: null,
      sourceUrl: "http://issuer.example/card",
      bonusPoints: null,
      offerSummary: "Illustrative sign-up offer.",
    });

    expect(cardOfferReadiness(offer, TODAY)).toEqual({
      ready: false,
      reasons: [
        "confidence must be Confirmed",
        "review-by date is required",
        "source URL must be a valid HTTPS URL",
        "bonus points must be greater than zero for sign-up and points bonus offers",
        "remove placeholder wording (illustrative)",
      ],
    });
    expect(cardOfferPublishErrorMessage(offer, TODAY)).toBe(
      "Cannot publish: confidence must be Confirmed; review-by date is required; " +
        "source URL must be a valid HTTPS URL; bonus points must be greater than " +
        "zero for sign-up and points bonus offers; remove placeholder wording " +
        "(illustrative)."
    );
  });

  it("rejects yesterday but keeps today and future dates", () => {
    expect(isPublicReadyCardOffer(readyOffer({ expiryDate: "2026-07-09" }), TODAY)).toBe(
      false
    );
    expect(isPublicReadyCardOffer(readyOffer({ expiryDate: TODAY }), TODAY)).toBe(true);
    expect(
      isPublicReadyCardOffer(readyOffer({ expiryDate: "2026-07-11" }), TODAY)
    ).toBe(true);
  });

  it("allows a genuinely ongoing offer while its review deadline is current", () => {
    expect(
      cardOfferReadiness(
        readyOffer({ expiryDate: null, reviewByDate: "2026-08-10" }),
        TODAY
      )
    ).toEqual({ ready: true });
  });

  it("fails closed when an ongoing offer passes its review deadline", () => {
    expect(
      cardOfferReadiness(
        readyOffer({ expiryDate: null, reviewByDate: "2026-07-09" }),
        TODAY
      )
    ).toEqual({
      ready: false,
      reasons: ["review-by date has passed; verify the offer again"],
    });
  });

  it("requires the headline field that matches the selected offer type", () => {
    expect(
      isPublicReadyCardOffer(
        readyOffer({
          offerType: "cashback",
          bonusPoints: 80000,
          cashbackAmount: 250,
        }),
        TODAY
      )
    ).toBe(true);
    expect(
      isPublicReadyCardOffer(
        readyOffer({
          offerType: "cashback",
          bonusPoints: 80000,
          cashbackAmount: null,
        }),
        TODAY
      )
    ).toBe(false);
    expect(
      isPublicReadyCardOffer(
        readyOffer({ offerType: "statement_credit", statementCreditAmount: 100 }),
        TODAY
      )
    ).toBe(true);
    expect(
      isPublicReadyCardOffer(
        readyOffer({ offerType: "points_bonus", bonusPoints: 50000 }),
        TODAY
      )
    ).toBe(true);
  });

  it("allows a zero annual fee to represent a full fee waiver", () => {
    expect(
      isPublicReadyCardOffer(
        readyOffer({ offerType: "annual_fee_discount", annualFee: 0 }),
        TODAY
      )
    ).toBe(true);
    expect(
      isPublicReadyCardOffer(
        readyOffer({ offerType: "annual_fee_discount", annualFee: null }),
        TODAY
      )
    ).toBe(false);
  });

  it("rejects zero or non-finite promotional amounts", () => {
    expect(isPublicReadyCardOffer(readyOffer({ bonusPoints: 0 }), TODAY)).toBe(false);
    expect(isPublicReadyCardOffer(readyOffer({ bonusPoints: Number.NaN }), TODAY)).toBe(
      false
    );
  });

  it("requires a parseable HTTPS issuer URL", () => {
    expect(isPublicReadyCardOffer(readyOffer({ sourceUrl: "" }), TODAY)).toBe(false);
    expect(
      isPublicReadyCardOffer(readyOffer({ sourceUrl: "mailto:cards@example.com" }), TODAY)
    ).toBe(false);
    expect(
      isPublicReadyCardOffer(readyOffer({ sourceUrl: "not a URL" }), TODAY)
    ).toBe(false);
  });

  it("checks all public copy fields for high-precision placeholder markers", () => {
    expect(
      cardOfferReadiness(
        readyOffer({
          provider: "Placeholder Bank",
          cardName: "Placeholder Platinum",
          offerSummary: "Demo row",
          eligibilityNotes: "Example only",
        }),
        TODAY
      )
    ).toMatchObject({
      ready: false,
      reasons: [
        "remove placeholder wording (demo row, example only, placeholder)",
      ],
    });
  });

  it("does not flag legitimate uses of sample or example", () => {
    const offer = readyOffer({
      offerSummary: "Includes a complimentary product sample after approval.",
      eligibilityNotes: "For example, identity checks may be required.",
    });
    expect(cardOfferReadiness(offer, TODAY)).toEqual({ ready: true });
  });
});
