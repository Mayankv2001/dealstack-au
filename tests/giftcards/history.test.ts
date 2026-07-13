import { describe, expect, it } from "vitest";
import {
  comparableOccurrence,
  summariseOfferHistory,
  type OfferOccurrence,
} from "@/lib/giftcards/history";

const occurrence = (over: Partial<OfferOccurrence> = {}): OfferOccurrence => ({
  id: "one",
  sellerKey: "coles",
  productKey: "apple",
  mechanic: "points",
  value: 20,
  startDate: "2026-06-01",
  endDate: "2026-06-07",
  verifiedAt: "2026-06-01T00:00:00Z",
  ...over,
});

describe("gift-card occurrence history", () => {
  it("compares only identical seller, product and mechanic", () => {
    const base = occurrence();
    expect(comparableOccurrence(base, occurrence({ id: "two" }))).toBe(true);
    expect(comparableOccurrence(base, occurrence({ sellerKey: "woolworths" }))).toBe(false);
    expect(comparableOccurrence(base, occurrence({ productKey: "myer" }))).toBe(false);
    expect(comparableOccurrence(base, occurrence({ mechanic: "discount" }))).toBe(false);
  });

  it("does not predict before three verified comparable occurrences", () => {
    const base = occurrence();
    const result = summariseOfferHistory(base, [
      base,
      occurrence({ id: "two", endDate: "2026-06-21", value: 15 }),
      occurrence({ id: "different", mechanic: "discount" }),
    ]);
    expect(result.canPredict).toBe(false);
    expect(result.medianValue).toBeNull();
    expect(result.typicalFrequencyDays).toBeNull();
  });

  it("uses median value and interval at three comparable occurrences", () => {
    const base = occurrence();
    const result = summariseOfferHistory(base, [
      base,
      occurrence({ id: "two", endDate: "2026-06-21", value: 15 }),
      occurrence({ id: "three", endDate: "2026-07-05", value: 20 }),
    ]);
    expect(result.canPredict).toBe(true);
    expect(result.medianValue).toBe(20);
    expect(result.typicalFrequencyDays).toBe(14);
  });
});
