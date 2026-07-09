import { describe, expect, it } from "vitest";
import {
  cardOfferHeadline,
  cardOfferToSourceResult,
  type CardOfferSourceInput,
} from "../../lib/sources/cardResults";
import { rankSourceResults } from "../../lib/sources/searchSources";

function makeCardInput(
  over: Partial<CardOfferSourceInput> = {}
): CardOfferSourceInput {
  return {
    id: "card-1",
    provider: "American Express",
    cardName: "Qantas Ultimate Card",
    bonusPoints: null,
    cashbackAmount: null,
    statementCreditAmount: null,
    offerSummary: "Illustrative sign-up bonus.",
    sourceUrl: "https://www.americanexpress.com/en-au/",
    expiryDate: null,
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    confidence: "needs-verification",
    ...over,
  };
}

describe("cardOfferHeadline", () => {
  it("prefers bonus points, formatted with an en-AU thousands separator", () => {
    expect(cardOfferHeadline(makeCardInput({ bonusPoints: 120000 }))).toBe(
      "120,000 bonus points"
    );
  });

  it("falls back to cashback amount when there are no bonus points", () => {
    expect(
      cardOfferHeadline(makeCardInput({ bonusPoints: null, cashbackAmount: 300 }))
    ).toBe("$300 cashback");
  });

  it("falls back to statement credit when there is no points/cashback", () => {
    expect(
      cardOfferHeadline(
        makeCardInput({
          bonusPoints: null,
          cashbackAmount: null,
          statementCreditAmount: 450,
        })
      )
    ).toBe("$450 statement credit");
  });

  it("falls back to a generic label when every amount is null", () => {
    expect(
      cardOfferHeadline(
        makeCardInput({
          bonusPoints: null,
          cashbackAmount: null,
          statementCreditAmount: null,
        })
      )
    ).toBe("Card offer");
  });
});

describe("cardOfferToSourceResult", () => {
  it("maps a card offer to a manual-source, card-kind DealSourceResult", () => {
    const input = makeCardInput({ id: "card-amex-qantas-bonus", bonusPoints: 100000 });
    const result = cardOfferToSourceResult(input);

    expect(result.id).toBe("card:card-amex-qantas-bonus");
    expect(result.kind).toBe("card");
    expect(result.source).toBe("manual");
    expect(result.merchantId).toBeNull();
    expect(result.merchant).toBeNull();
    expect(result.cardOrProvider).toBe("American Express");
    expect(result.pointsAmount).toBe("100,000 bonus points");
    expect(result.sourceUrl).toBe(input.sourceUrl);
    expect(result.confidence).toBe(input.confidence);
    expect(result.expiryDate).toBe(input.expiryDate);
    expect(result.lastCheckedAt).toBe(input.lastCheckedAt);
  });

  it("passes through a non-null expiry date", () => {
    const result = cardOfferToSourceResult(
      makeCardInput({ expiryDate: "2026-12-31" })
    );
    expect(result.expiryDate).toBe("2026-12-31");
  });
});

describe("card results in the search pipeline", () => {
  it("is found when the query matches its provider (part of the search haystack)", () => {
    const cardResult = cardOfferToSourceResult(
      makeCardInput({ provider: "Amex", cardName: "Qantas Ultimate Card" })
    );
    const found = rankSourceResults([cardResult], "amex");
    expect(found.map((r) => r.id)).toContain(cardResult.id);
  });

  it("is not found for a query that matches nothing about it", () => {
    const cardResult = cardOfferToSourceResult(
      makeCardInput({ provider: "Amex", cardName: "Qantas Ultimate Card" })
    );
    const found = rankSourceResults([cardResult], "myer");
    expect(found.map((r) => r.id)).not.toContain(cardResult.id);
  });
});
