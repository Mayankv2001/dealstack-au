import { describe, expect, it } from "vitest";
import { filterLive, isPastExpiry, todayAU } from "@/lib/offers/expiry";

describe("isPastExpiry", () => {
  it("null expiry is never expired (evergreen)", () =>
    expect(isPastExpiry(null, "2026-07-07")).toBe(false));
  it("undefined expiry is never expired (evergreen)", () =>
    expect(isPastExpiry(undefined, "2026-07-07")).toBe(false));
  it("expiry today is still live (matches cleanup lt semantics)", () =>
    expect(isPastExpiry("2026-07-07", "2026-07-07")).toBe(false));
  it("expiry yesterday is expired", () =>
    expect(isPastExpiry("2026-07-06", "2026-07-07")).toBe(true));
  it("expiry tomorrow is live", () =>
    expect(isPastExpiry("2026-07-08", "2026-07-07")).toBe(false));
  it("string compare handles month/year boundaries", () => {
    expect(isPastExpiry("2025-12-31", "2026-01-01")).toBe(true);
    expect(isPastExpiry("2026-10-02", "2026-09-30")).toBe(false);
  });
});

describe("filterLive", () => {
  it("drops only hard-expired items", () => {
    const items = [
      { id: "a", expiryDate: null },
      { id: "b", expiryDate: "2026-07-06" },
      { id: "c", expiryDate: "2026-07-07" },
    ];
    expect(filterLive(items, "2026-07-07").map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("keeps items with an optional/absent expiryDate (signal shape)", () => {
    const items: { id: string; expiryDate?: string | null }[] = [
      { id: "a" },
      { id: "b", expiryDate: "2026-01-01" },
    ];
    expect(filterLive(items, "2026-07-07").map((i) => i.id)).toEqual(["a"]);
  });
});

describe("todayAU", () => {
  it("formats as YYYY-MM-DD in Australia/Sydney", () => {
    // 2026-07-07T13:59:00Z is 23:59 AEST on the 7th; 14:01Z rolls to the 8th.
    expect(todayAU(new Date("2026-07-07T13:59:00Z"))).toBe("2026-07-07");
    expect(todayAU(new Date("2026-07-07T14:01:00Z"))).toBe("2026-07-08");
  });
});
