import { describe, expect, it } from "vitest";
import {
  boundedOsaDistance,
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

// ── boundedOsaDistance ───────────────────────────────────────────────────────

describe("boundedOsaDistance", () => {
  it("is zero for identical strings", () => {
    expect(boundedOsaDistance("myer", "myer", 2)).toBe(0);
  });

  it("scores an adjacent transposition as 1 (OSA, not plain Levenshtein)", () => {
    // 'myre' -> 'myer' is a swap of the last two letters: Levenshtein = 2,
    // OSA = 1. This is the flagship store-name typo the near-match must catch.
    expect(boundedOsaDistance("myre", "myer", 2)).toBe(1);
  });

  it("counts single insert/delete/substitute as 1", () => {
    expect(boundedOsaDistance("coles", "coels", 2)).toBe(1); // transpose
    expect(boundedOsaDistance("myer", "myers", 2)).toBe(1); // insert
    expect(boundedOsaDistance("myer", "mye", 2)).toBe(1); // delete
    expect(boundedOsaDistance("myer", "myar", 2)).toBe(1); // substitute
  });

  it("returns max+1 once the true distance exceeds the bound", () => {
    // 'niketown' vs 'nike' differ by 4 (append 'town'); bounded at 2 → 3.
    expect(boundedOsaDistance("niketown", "nike", 2)).toBe(3);
  });

  it("short-circuits on length gap alone without scanning", () => {
    expect(boundedOsaDistance("a", "abcdef", 2)).toBe(3);
  });

  it("handles empty strings within and beyond the bound", () => {
    expect(boundedOsaDistance("", "ab", 2)).toBe(2);
    expect(boundedOsaDistance("", "abc", 2)).toBe(3);
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

  it("AEDT regression pin: expired at AU midnight, not at +10:00 midnight", () => {
    // 2026-01-15T13:30Z = 2026-01-16 00:30 AEDT (Sydney is UTC+11 in January).
    // The old fixed +10:00 end-of-day (13:59:59Z) said "still live" here.
    expect(isExpired(makeResult("2026-01-15"), new Date("2026-01-15T13:30:00Z"))).toBe(true);
  });

  it("AEDT: still live for the whole AU-local expiry day", () => {
    // 2026-01-15T12:59Z = 2026-01-15 23:59 AEDT — same calendar day, live.
    expect(isExpired(makeResult("2026-01-15"), new Date("2026-01-15T12:59:00Z"))).toBe(false);
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
