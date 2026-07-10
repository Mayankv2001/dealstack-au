import { describe, expect, it } from "vitest";
import {
  daysUntilExpiryAU,
  expiryUrgencyLabelAU,
  filterLive,
  isExpiringSoonAU,
  isPastExpiry,
  todayAU,
} from "@/lib/offers/expiry";

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

describe("isExpiringSoonAU", () => {
  // 02:00Z is midday AEST on 7 Jul (winter, UTC+10).
  const now = new Date("2026-07-07T02:00:00Z");

  it("null/undefined expiry is never expiring soon", () => {
    expect(isExpiringSoonAU(null, now)).toBe(false);
    expect(isExpiringSoonAU(undefined, now)).toBe(false);
  });
  it("yesterday is already past, not soon", () =>
    expect(isExpiringSoonAU("2026-07-06", now)).toBe(false));
  it("expiry today is soon", () =>
    expect(isExpiringSoonAU("2026-07-07", now)).toBe(true));
  it("today + soonDays is included", () =>
    expect(isExpiringSoonAU("2026-07-14", now)).toBe(true));
  it("today + soonDays + 1 is not", () =>
    expect(isExpiringSoonAU("2026-07-15", now)).toBe(false));
  it("window crosses month/year boundaries", () => {
    // 01:00Z is midday AEDT on 29 Dec; 29 Dec + 7 days → 5 Jan.
    const dec = new Date("2026-12-29T01:00:00Z");
    expect(todayAU(dec)).toBe("2026-12-29");
    expect(isExpiringSoonAU("2027-01-05", dec)).toBe(true);
    expect(isExpiringSoonAU("2027-01-06", dec)).toBe(false);
  });
  it("AEDT regression pin: uses the AU-local calendar date, not +10:00", () => {
    // 2026-01-15T13:30:00Z is 00:30 AEDT on 16 Jan in Sydney. The old
    // hardcoded +10:00 helpers were an hour behind here.
    const aedt = new Date("2026-01-15T13:30:00Z");
    expect(todayAU(aedt)).toBe("2026-01-16");
    // Expiry equal to the AU-local date must be soon...
    expect(isExpiringSoonAU("2026-01-16", aedt)).toBe(true);
    // ...and the previous AU-local day is past (the +10:00 logic said soon).
    expect(isExpiringSoonAU("2026-01-15", aedt)).toBe(false);
  });
  it("honours a caller-supplied soonDays window", () => {
    expect(isExpiringSoonAU("2026-07-10", now, 3)).toBe(true);
    expect(isExpiringSoonAU("2026-07-11", now, 3)).toBe(false);
  });
});

describe("daysUntilExpiryAU", () => {
  // 02:00Z is midday AEST on 7 Jul (winter, UTC+10).
  const now = new Date("2026-07-07T02:00:00Z");

  it("null/undefined expiry → null (evergreen)", () => {
    expect(daysUntilExpiryAU(null, now)).toBeNull();
    expect(daysUntilExpiryAU(undefined, now)).toBeNull();
  });
  it("counts calendar days: today 0, tomorrow 1, yesterday -1", () => {
    expect(daysUntilExpiryAU("2026-07-07", now)).toBe(0);
    expect(daysUntilExpiryAU("2026-07-08", now)).toBe(1);
    expect(daysUntilExpiryAU("2026-07-06", now)).toBe(-1);
  });
  it("crosses month/year boundaries", () => {
    // 01:00Z is midday AEDT on 29 Dec.
    const dec = new Date("2026-12-29T01:00:00Z");
    expect(daysUntilExpiryAU("2027-01-05", dec)).toBe(7);
  });
});

describe("expiryUrgencyLabelAU", () => {
  const now = new Date("2026-07-07T02:00:00Z");

  it("null for evergreen, past, and beyond the soon window", () => {
    expect(expiryUrgencyLabelAU(null, now)).toBeNull();
    expect(expiryUrgencyLabelAU("2026-07-06", now)).toBeNull();
    expect(expiryUrgencyLabelAU("2026-07-15", now)).toBeNull();
  });
  it("phrases today / tomorrow / N days", () => {
    expect(expiryUrgencyLabelAU("2026-07-07", now)).toBe("Ends today");
    expect(expiryUrgencyLabelAU("2026-07-08", now)).toBe("Ends tomorrow");
    expect(expiryUrgencyLabelAU("2026-07-12", now)).toBe("Ends in 5 days");
    expect(expiryUrgencyLabelAU("2026-07-14", now)).toBe("Ends in 7 days");
  });
  it("honours a caller-supplied soonDays window", () => {
    expect(expiryUrgencyLabelAU("2026-07-10", now, 3)).toBe("Ends in 3 days");
    expect(expiryUrgencyLabelAU("2026-07-11", now, 3)).toBeNull();
  });
});
