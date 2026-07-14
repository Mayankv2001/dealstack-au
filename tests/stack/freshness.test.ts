import { describe, expect, it } from "vitest";
import { publicFreshness } from "@/lib/freshness";

const NOW = new Date("2026-07-14T12:00:00+10:00");

describe("public freshness states", () => {
  it("labels a same-day check and keeps its supporting date", () => {
    expect(publicFreshness("2026-07-14T01:00:00+10:00", NOW)).toEqual({
      state: "checked-today",
      label: "Checked today",
      checkedDate: "14 Jul 2026",
    });
  });

  it("uses the existing seven-day recent window", () => {
    expect(publicFreshness("2026-07-08T01:00:00+10:00", NOW)).toEqual({
      state: "checked-this-week",
      label: "Checked this week",
      checkedDate: "8 Jul 2026",
    });
  });

  it("marks older checks as needing recheck", () => {
    expect(publicFreshness("2026-07-01T01:00:00+10:00", NOW)).toEqual({
      state: "needs-recheck",
      label: "Needs recheck",
      checkedDate: "1 Jul 2026",
    });
  });

  it("distinguishes a missing check from a stale one", () => {
    expect(publicFreshness(null, NOW)).toEqual({
      state: "not-yet-checked",
      label: "Not yet checked",
      checkedDate: null,
    });
  });
});
