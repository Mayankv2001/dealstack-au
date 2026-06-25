import { describe, expect, it } from "vitest";
import {
  deriveConfidence,
  findMerchantIdInText,
  formatDateAU,
  isExpired,
  matchMerchantId,
  normaliseText,
} from "../../lib/sources/normalise";
import type { DealSourceResult } from "../../lib/sources/types";

// ── normaliseText ────────────────────────────────────────────────────────────

describe("normaliseText", () => {
  it("lowercases and collapses non-alphanumeric runs to single spaces", () => {
    expect(normaliseText("JB Hi-Fi!  TVs")).toBe("jb hi fi tvs");
    expect(normaliseText("  Coles   ")).toBe("coles");
    expect(normaliseText("")).toBe("");
  });
});

// ── matchMerchantId ─────────────────────────────────────────────────────────

describe("matchMerchantId", () => {
  it("matches store name exactly (case-insensitive)", () => {
    expect(matchMerchantId("Myer")).toBe("myer");
    expect(matchMerchantId("COLES")).toBe("coles");
    expect(matchMerchantId("JB Hi-Fi")).toBe("jb-hifi");
  });

  it("matches known aliases", () => {
    expect(matchMerchantId("woolies")).toBe("woolworths");
    expect(matchMerchantId("Amazon AU")).toBe("amazon-au");
    expect(matchMerchantId("The Good Guys")).toBe("the-good-guys");
  });

  it("returns null for unknown names", () => {
    expect(matchMerchantId("Bunnings")).toBeNull();
    expect(matchMerchantId("")).toBeNull();
  });
});

// ── findMerchantIdInText ────────────────────────────────────────────────────

describe("findMerchantIdInText", () => {
  it("finds a merchant mentioned in free text", () => {
    expect(findMerchantIdInText("50% off at JB Hi-Fi today")).toBe("jb-hifi");
    expect(findMerchantIdInText("Big Coles sale this week")).toBe("coles");
  });

  it("prefers longer aliases to shorter ones", () => {
    // "amazon australia" is longer than "amazon" — both map to the same id
    expect(findMerchantIdInText("amazon australia sale")).toBe("amazon-au");
  });

  it("returns null when no merchant is mentioned", () => {
    expect(findMerchantIdInText("a random deal with no store")).toBeNull();
    expect(findMerchantIdInText("")).toBeNull();
  });

  it("does not match short aliases as substrings of other words", () => {
    // "cw" is a Chemist Warehouse alias — must NOT match "new", "screw", etc.
    expect(findMerchantIdInText("screw the rules")).toBeNull();
  });
});

// ── isExpired ────────────────────────────────────────────────────────────────

function makeResult(expiryDate: string | null): DealSourceResult {
  return {
    id: "test",
    source: "manual",
    kind: "discount-code",
    title: "Test",
    merchant: null,
    merchantId: null,
    summary: "",
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate,
    startDate: null,
    sourceUrl: "https://example.com",
    publishedAt: null,
    lastCheckedAt: "2026-01-01T00:00:00Z",
    confidence: "confirmed",
  };
}

describe("isExpired", () => {
  it("returns false when expiryDate is null", () => {
    expect(isExpired(makeResult(null), new Date("2026-07-01"))).toBe(false);
  });

  it("returns false when the expiry day has not yet passed (inclusive)", () => {
    // Expiry is 2026-06-30; checking at 09:00 AEST on 2026-06-30 = still valid
    expect(
      isExpired(makeResult("2026-06-30"), new Date("2026-06-30T09:00:00+10:00"))
    ).toBe(false);
  });

  it("returns true when the expiry day has passed", () => {
    expect(
      isExpired(makeResult("2026-06-29"), new Date("2026-06-30T00:00:00+10:00"))
    ).toBe(true);
  });
});

// ── deriveConfidence ─────────────────────────────────────────────────────────

describe("deriveConfidence", () => {
  it("returns stored confidence when not expired", () => {
    const result = makeResult("2099-12-31");
    expect(deriveConfidence({ ...result, confidence: "confirmed" }, new Date("2026-01-01"))).toBe("confirmed");
    expect(deriveConfidence({ ...result, confidence: "needs-verification" }, new Date("2026-01-01"))).toBe("needs-verification");
  });

  it("overrides stored confidence with 'expired-unknown' when expired", () => {
    const result = makeResult("2020-01-01");
    expect(deriveConfidence({ ...result, confidence: "confirmed" }, new Date("2026-01-01"))).toBe("expired-unknown");
  });
});

// ── formatDateAU ─────────────────────────────────────────────────────────────

describe("formatDateAU", () => {
  it("formats an ISO date string to Australian day/month/year format", () => {
    expect(formatDateAU("2026-06-30")).toBe("30 Jun 2026");
    expect(formatDateAU("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDateAU("2026-12-31")).toBe("31 Dec 2026");
  });

  it("handles a datetime string by ignoring the time portion", () => {
    expect(formatDateAU("2026-06-30T12:00:00Z")).toBe("30 Jun 2026");
  });

  it("returns null for null input or malformed strings", () => {
    expect(formatDateAU(null)).toBeNull();
    expect(formatDateAU("not-a-date")).toBeNull();
  });
});
