import { describe, expect, it } from "vitest";
import { rankResults, scoreResult } from "../../lib/sources/ranking";
import type { RankedDealResult } from "../../lib/sources/types";

const NOW = new Date("2026-06-20T12:00:00Z");

function result(over: Partial<RankedDealResult>): RankedDealResult {
  return {
    id: "r1",
    source: "manual",
    kind: "cashback",
    title: "Test offer",
    merchant: "Myer",
    merchantId: "myer",
    summary: "",
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://example.com",
    publishedAt: null,
    lastCheckedAt: NOW.toISOString(),
    confidence: "confirmed",
    score: 0,
    citations: [{ source: "manual", sourceUrl: "https://example.com" }],
    ...over,
  };
}

describe("scoreResult", () => {
  it("scores a confirmed, merchant-matched, recently-checked result near maximum", () => {
    const score = scoreResult(result({}), {
      queryMerchantId: "myer",
      now: NOW,
    });
    expect(score).toBeGreaterThan(0.8);
  });

  it("scores lower when the merchant does not match the query", () => {
    const matchScore = scoreResult(result({ merchantId: "myer" }), {
      queryMerchantId: "myer",
      now: NOW,
    });
    const mismatchScore = scoreResult(result({ merchantId: "coles" }), {
      queryMerchantId: "myer",
      now: NOW,
    });
    expect(matchScore).toBeGreaterThan(mismatchScore);
  });

  it("uses a neutral merchant score (0.5) when no query merchant is set", () => {
    const withQuery = scoreResult(result({ merchantId: "myer" }), {
      queryMerchantId: "myer",
      now: NOW,
    });
    const withoutQuery = scoreResult(result({ merchantId: "myer" }), {
      queryMerchantId: null,
      now: NOW,
    });
    // With a matching query the merchant weight is fully captured; without query it is halved.
    expect(withQuery).toBeGreaterThan(withoutQuery);
  });

  it("scores expired-unknown confidence as 0 on the confidence component", () => {
    const confirmed = scoreResult(result({ confidence: "confirmed" }), {
      queryMerchantId: null,
      now: NOW,
    });
    const expiredUnknown = scoreResult(
      result({ confidence: "expired-unknown" }),
      { queryMerchantId: null, now: NOW }
    );
    expect(confirmed).toBeGreaterThan(expiredUnknown);
  });

  it("boosts score proportionally for larger discountPercent values", () => {
    const low = scoreResult(result({ discountPercent: 5 }), {
      queryMerchantId: null,
      now: NOW,
    });
    const high = scoreResult(result({ discountPercent: 20 }), {
      queryMerchantId: null,
      now: NOW,
    });
    expect(high).toBeGreaterThan(low);
  });

  it("caps the savings score at 1 (25%+ discount is treated as 25%)", () => {
    const at25 = scoreResult(result({ discountPercent: 25 }), {
      queryMerchantId: null,
      now: NOW,
    });
    const above25 = scoreResult(result({ discountPercent: 50 }), {
      queryMerchantId: null,
      now: NOW,
    });
    expect(at25).toBe(above25);
  });

  it("gives a higher trust score to manual (trustWeight 1) than ozbargain (0.85)", () => {
    const manual = scoreResult(result({ source: "manual" }), {
      queryMerchantId: null,
      now: NOW,
    });
    const ozb = scoreResult(result({ source: "ozbargain" }), {
      queryMerchantId: null,
      now: NOW,
    });
    expect(manual).toBeGreaterThan(ozb);
  });

  it("adds a small corroboration bonus for each extra citation (up to 0.2)", () => {
    // Use ozbargain (trustWeight 0.85) so corroboration has room to boost the score.
    const single = scoreResult(
      result({
        source: "ozbargain",
        citations: [{ source: "ozbargain", sourceUrl: "https://a.com" }],
      }),
      { queryMerchantId: null, now: NOW }
    );
    const corroborated = scoreResult(
      result({
        source: "ozbargain",
        citations: [
          { source: "ozbargain", sourceUrl: "https://a.com" },
          { source: "pointhacks", sourceUrl: "https://b.com" },
          { source: "freepoints", sourceUrl: "https://c.com" },
        ],
      }),
      { queryMerchantId: null, now: NOW }
    );
    expect(corroborated).toBeGreaterThan(single);
  });

  it("scores a stale result lower than a freshly checked one", () => {
    const fresh = scoreResult(
      result({ lastCheckedAt: "2026-06-19T12:00:00Z" }),
      { queryMerchantId: null, now: NOW }
    );
    const stale = scoreResult(
      result({ lastCheckedAt: "2026-05-01T12:00:00Z" }),
      { queryMerchantId: null, now: NOW }
    );
    expect(fresh).toBeGreaterThan(stale);
  });

  it("returns 0 for recency when lastCheckedAt is not parseable", () => {
    const badDate = scoreResult(
      result({ lastCheckedAt: "not-a-date" }),
      { queryMerchantId: null, now: NOW }
    );
    const goodDate = scoreResult(
      result({ lastCheckedAt: NOW.toISOString() }),
      { queryMerchantId: null, now: NOW }
    );
    // badDate gets recency=0 so it scores lower on the recency component.
    expect(goodDate).toBeGreaterThan(badDate);
  });
});

describe("rankResults", () => {
  const ctx = { queryMerchantId: "myer", now: NOW };

  it("returns an empty array for no results", () => {
    expect(rankResults([], ctx)).toHaveLength(0);
  });

  it("places active items before expired ones", () => {
    const active = result({ id: "active", expiryDate: "2026-12-31" });
    const expired = result({ id: "expired", expiryDate: "2025-01-01" });
    const ranked = rankResults([expired, active], ctx);
    expect(ranked[0].id).toBe("active");
    expect(ranked[1].id).toBe("expired");
  });

  it("sorts active items by descending score", () => {
    const highConfidence = result({ id: "high", confidence: "confirmed" });
    const lowConfidence = result({ id: "low", confidence: "needs-verification" });
    const ranked = rankResults([lowConfidence, highConfidence], ctx);
    expect(ranked[0].id).toBe("high");
  });

  it("also sorts expired items by descending score among themselves", () => {
    // deriveConfidence returns 'expired-unknown' for all expired items, so
    // confidence can't distinguish them. Use merchant match to create a score gap.
    const pastExpiry = "2025-01-01";
    const highExpired = result({
      id: "high-expired",
      expiryDate: pastExpiry,
      merchantId: "myer", // matches ctx.queryMerchantId — higher merchant score
    });
    const lowExpired = result({
      id: "low-expired",
      expiryDate: pastExpiry,
      merchantId: "coles", // different store — lower merchant score
    });
    const ranked = rankResults([lowExpired, highExpired], ctx);
    // Both are expired; the merchant-matched one still sorts first.
    expect(ranked[0].id).toBe("high-expired");
    expect(ranked[1].id).toBe("low-expired");
  });

  it("handles a mix of active and expired items with correct partitioning", () => {
    const a = result({ id: "a", expiryDate: "2026-12-31", confidence: "confirmed" });
    const b = result({ id: "b", expiryDate: null }); // active (no expiry)
    const c = result({ id: "c", expiryDate: "2025-01-01" }); // expired
    const ranked = rankResults([c, a, b], ctx);
    const ids = ranked.map((r) => r.id);
    // c (expired) must be last regardless of score
    expect(ids.indexOf("c")).toBeGreaterThan(ids.indexOf("a"));
    expect(ids.indexOf("c")).toBeGreaterThan(ids.indexOf("b"));
  });
});
