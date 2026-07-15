import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPredictionFingerprint,
  extractFamilies,
  normalisePredictionFamilies,
  parseGcdbPredictions,
  parseSlashDate,
  type ParsedPrediction,
} from "@/lib/giftcards/parsePredictions";

const fixture = readFileSync(
  new URL("../fixtures/gcdb-predictions.html", import.meta.url),
  "utf8"
);

const page = parseGcdbPredictions(fixture);
const bySeller = (text: string): ParsedPrediction =>
  page.predictions.find((p) => p.predictedPromotionText.includes(text))!;

describe("parseSlashDate", () => {
  it("parses Australian D/M/YYYY to ISO", () => {
    expect(parseSlashDate("15/7/2026")).toBe("2026-07-15");
    expect(parseSlashDate("1/12/2026")).toBe("2026-12-01");
  });
  it("rejects non-numeric or malformed input", () => {
    expect(parseSlashDate("N/A")).toBeNull();
    expect(parseSlashDate("2026-07-15")).toBeNull();
    expect(parseSlashDate(null)).toBeNull();
    expect(parseSlashDate("40/1/2026")).toBeNull();
    expect(parseSlashDate("31/2/2026")).toBeNull();
    expect(parseSlashDate("29/2/2025")).toBeNull();
    expect(parseSlashDate("29/2/2024")).toBe("2024-02-29");
  });
});

describe("parseGcdbPredictions — page metadata", () => {
  it("extracts the source last-updated stamp", () => {
    expect(page.sourceLastUpdated).toBe("2026-07-10");
  });
  it("parses every real data row and skips the header", () => {
    expect(page.predictions).toHaveLength(9);
    expect(page.predictions.every((p) => p.predictedSeller.length > 0)).toBe(true);
  });
});

describe("parseGcdbPredictions — mechanic classification", () => {
  it("classifies a bonus-percent promotion and captures the percent", () => {
    const p = bySeller("Bonus 10% on Myer gift cards");
    expect(p.predictedSeller).toBe("Coles");
    expect(p.predictedPromotionType).toBe("bonus-value");
    expect(p.predictedDiscountPercent).toBe(10);
    expect(p.predictedValue).toMatch(/bonus 10%/i);
    expect(p.predictedFamilies).toEqual(["Myer"]);
    expect(p.predictedStartsAt).toBe("2026-07-15");
    expect(p.predictedEndsAt).toBe("2026-07-21");
    expect(p.refUrl).toContain("/offer/7407");
  });
  it("classifies fixed-points and does not treat it as a percentage", () => {
    const p = bySeller("1000 points on");
    expect(p.predictedPromotionType).toBe("fixed-points");
    expect(p.predictedDiscountPercent).toBeNull();
    expect(p.predictedValue).toMatch(/1000 points/i);
    expect(p.predictedFamilies).toContain("TCN Her");
  });
  it("classifies a percentage discount", () => {
    const p = bySeller("20% off Nintendo eShop");
    expect(p.predictedPromotionType).toBe("discount");
    expect(p.predictedDiscountPercent).toBe(20);
    expect(p.predictedFamilies).toEqual(["Nintendo eShop"]);
  });
  it("classifies a fixed-dollar discount over a %-discount tail", () => {
    const p = bySeller("$13 off $250 Coles Mastercard");
    expect(p.predictedPromotionType).toBe("fixed-dollar-discount");
    expect(p.predictedValue).toMatch(/\$13 off/i);
    expect(p.predictedDiscountPercent).toBeNull();
  });
  it("classifies a fee waiver", () => {
    const p = bySeller("$0 purchase fees on TCN Eftpos");
    expect(p.predictedPromotionType).toBe("fee-waiver");
    expect(p.predictedFamilies).toEqual(["TCN Eftpos"]);
  });
  it("classifies a points multiplier and a multi-brand family list", () => {
    const p = bySeller("20x points on Celebration");
    expect(p.predictedPromotionType).toBe("points");
    expect(p.predictedFamilies).toContain("Celebration");
    expect(p.predictedFamilies).toContain("RedBalloon");
  });
  it("classifies 'No promotion' as none with no value and no ref", () => {
    const p = bySeller("No promotion");
    expect(p.predictedPromotionType).toBe("none");
    expect(p.predictedValue).toBeNull();
    expect(p.predictedFamilies).toEqual([]);
    expect(p.refUrl).toBeNull();
  });
});

describe("parseGcdbPredictions — outcome markers stay uninterpreted", () => {
  it("preserves ✅/❌ verbatim and never derives an outcome from them", () => {
    expect(bySeller("Bonus 10% on Myer gift cards").rawMarker).toBe("✅");
    expect(bySeller("20x points on Celebration").rawMarker).toBe("❌");
    // Parser output has no status/outcome field at all — interpretation is the
    // repo's job and only via reconciliation, never via the marker.
    expect(
      Object.keys(bySeller("Bonus 10% on Myer gift cards"))
    ).not.toContain("status");
  });
  it("leaves rawMarker null when no marker is present", () => {
    expect(bySeller("20% off Nintendo eShop").rawMarker).toBeNull();
  });
});

describe("parseGcdbPredictions — fingerprint identity", () => {
  it("is stable across re-parses of the same page", () => {
    const again = parseGcdbPredictions(fixture);
    const a = page.predictions.map((p) => p.fingerprint).sort();
    const b = again.predictions.map((p) => p.fingerprint).sort();
    expect(a).toEqual(b);
  });
  it("keeps every fixture identity distinct", () => {
    const fps = new Set(page.predictions.map((p) => p.fingerprint));
    expect(fps.size).toBe(page.predictions.length);
  });

  it("keeps the same seller/window distinct when card families differ", () => {
    const apple = buildPredictionFingerprint(
      "Coles",
      ["Apple"],
      "2026-07-15",
      "2026-07-21",
    );
    const myer = buildPredictionFingerprint(
      "Coles",
      ["Myer"],
      "2026-07-15",
      "2026-07-21",
    );
    expect(apple).not.toBe(myer);
  });

  it("is stable across family order, duplicates, case and whitespace", () => {
    const first = buildPredictionFingerprint(
      "  COLES ",
      ["Myer", " Apple ", "myer"],
      "2026-07-15",
      "2026-07-21",
    );
    const second = buildPredictionFingerprint(
      "coles",
      ["apple", "MYER"],
      "2026-07-15",
      "2026-07-21",
    );
    expect(first).toBe(second);
    expect(normalisePredictionFamilies(["Myer", " Apple ", "myer"])).toEqual([
      "apple",
      "myer",
    ]);
  });
});

describe("extractFamilies", () => {
  it("reads a clean 'on … gift cards' list", () => {
    expect(
      extractFamilies("20x points on Apple and Myer gift cards")
    ).toEqual(["Apple", "Myer"]);
  });
  it("strips denomination prefixes and keeps the brand", () => {
    expect(
      extractFamilies("1000 points on $50 and $100 TCN Her gift cards")
    ).toContain("TCN Her");
  });
  it("returns [] when there is no parseable family list", () => {
    expect(extractFamilies("No promotion")).toEqual([]);
  });
});
