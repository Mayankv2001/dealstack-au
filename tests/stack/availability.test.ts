import { describe, expect, it } from "vitest";
import {
  formatWeekLabel,
  isActiveDateRange,
  melbourneDateKey,
  mondayOfWeek,
} from "../../lib/offers/availability";

describe("offer availability", () => {
  it("uses the Melbourne calendar around the UTC day boundary", () => {
    expect(melbourneDateKey(new Date("2026-07-17T14:30:00Z"))).toBe(
      "2026-07-18"
    );
  });

  it("treats start and expiry dates as inclusive", () => {
    expect(isActiveDateRange("2026-07-18", "2026-07-18", "2026-07-18")).toBe(
      true
    );
    expect(isActiveDateRange("2026-07-19", null, "2026-07-18")).toBe(false);
    expect(isActiveDateRange(null, "2026-07-17", "2026-07-18")).toBe(false);
  });

  it("derives and formats the current Monday", () => {
    expect(mondayOfWeek("2026-07-18")).toBe("2026-07-13");
    expect(formatWeekLabel("2026-07-13")).toBe("Week of 13 July 2026");
  });
});
