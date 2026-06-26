import { describe, expect, it } from "vitest";
import { isWeekOfStale, weekMondayAU } from "@/lib/admin/dateHelpers";

// 2026-06-22 is a Monday (verified: Jan 1 2026 = Thu, +172 days = Mon).

describe("weekMondayAU", () => {
  it("returns the input date itself when it is a Monday", () => {
    // 2026-06-22T10:00:00Z = 2026-06-22 20:00 AEST — still Monday AU
    expect(weekMondayAU(new Date("2026-06-22T10:00:00Z"))).toBe("2026-06-22");
  });

  it("returns the same Monday for any weekday in the same week", () => {
    // Tue 23 Jun AU
    expect(weekMondayAU(new Date("2026-06-23T00:00:00Z"))).toBe("2026-06-22");
    // Wed 24 Jun AU
    expect(weekMondayAU(new Date("2026-06-24T00:00:00Z"))).toBe("2026-06-22");
    // Fri 26 Jun AU
    expect(weekMondayAU(new Date("2026-06-26T00:00:00Z"))).toBe("2026-06-22");
  });

  it("returns the same Monday for Sunday in the same week", () => {
    // 2026-06-28T12:00:00Z = 2026-06-28 22:00 AEST — still Sunday AU
    expect(weekMondayAU(new Date("2026-06-28T12:00:00Z"))).toBe("2026-06-22");
  });

  it("advances to the next Monday at the AU midnight boundary", () => {
    // 2026-06-28T14:00:00Z = 2026-06-29 00:00 AEST — Monday of next week
    expect(weekMondayAU(new Date("2026-06-28T14:00:00Z"))).toBe("2026-06-29");
  });

  it("handles the AU/Sydney timezone offset — Sunday night UTC = Monday AU", () => {
    // 2026-06-28T23:00:00Z = 2026-06-29 09:00 AEST — Monday AU
    expect(weekMondayAU(new Date("2026-06-28T23:00:00Z"))).toBe("2026-06-29");
  });

  it("handles a Monday at the very start of the year", () => {
    // 2026-01-05 is a Monday
    expect(weekMondayAU(new Date("2026-01-05T00:00:00Z"))).toBe("2026-01-05");
  });

  it("handles a week spanning year boundary", () => {
    // 2025-12-29 (Mon) through 2026-01-04 (Sun) is one ISO week
    expect(weekMondayAU(new Date("2026-01-01T00:00:00Z"))).toBe("2025-12-29");
    expect(weekMondayAU(new Date("2026-01-04T00:00:00Z"))).toBe("2025-12-29");
  });
});

describe("isWeekOfStale", () => {
  const now = new Date("2026-06-26T00:00:00Z"); // Friday, week-of Mon 22 Jun

  it("returns false for the current week's Monday", () => {
    expect(isWeekOfStale("2026-06-22", now)).toBe(false);
  });

  it("returns false for a future week's Monday", () => {
    expect(isWeekOfStale("2026-06-29", now)).toBe(false);
  });

  it("returns true for last week", () => {
    expect(isWeekOfStale("2026-06-15", now)).toBe(true);
  });

  it("returns true for several weeks ago", () => {
    expect(isWeekOfStale("2026-05-01", now)).toBe(true);
  });

  it("returns false for the exact current Monday", () => {
    // weekOf equals currentWeekMonday — not stale (same week)
    expect(isWeekOfStale("2026-06-22", now)).toBe(false);
  });
});
