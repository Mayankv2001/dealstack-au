import { describe, expect, it } from "vitest";
import {
  decideSchedule,
  isSydneyRunHour,
  RUN_INTERVAL_GUARD_HOURS,
  sydneyHour,
} from "@/lib/giftcards/schedule";

/**
 * Australia/Sydney scheduling guards. The external scheduler fires daily at
 * BOTH UTC equivalents of 7am Sydney; the route only runs when it is really the
 * 7 o'clock hour locally AND the last real run was ≥ the interval guard ago.
 * These use fixed UTC instants so the DST handling is exercised, not mocked.
 */

// July = AEST (UTC+10): 7am Sydney is 21:00 UTC the day before.
const AEST_7AM = new Date("2026-07-11T21:00:00Z");
// January = AEDT (UTC+11): 7am Sydney is 20:00 UTC the day before.
const AEDT_7AM = new Date("2026-01-11T20:00:00Z");

describe("sydneyHour / isSydneyRunHour — DST-correct", () => {
  it("reads 7am local under AEST and AEDT from different UTC instants", () => {
    expect(sydneyHour(AEST_7AM)).toBe(7);
    expect(sydneyHour(AEDT_7AM)).toBe(7);
    expect(isSydneyRunHour(AEST_7AM)).toBe(true);
    expect(isSydneyRunHour(AEDT_7AM)).toBe(true);
  });

  it.each([
    {
      transition: "DST starts 4 Oct 2026",
      expectedUtc: "2026-10-03T20:00:00Z",
      otherTriggerUtc: "2026-10-03T21:00:00Z",
    },
    {
      transition: "DST ends 4 Apr 2027",
      expectedUtc: "2027-04-03T21:00:00Z",
      otherTriggerUtc: "2027-04-03T20:00:00Z",
    },
  ])(
    "accepts exactly one dual-cron instant when $transition",
    ({ expectedUtc, otherTriggerUtc }) => {
      expect(isSydneyRunHour(new Date(expectedUtc))).toBe(true);
      expect(isSydneyRunHour(new Date(otherTriggerUtc))).toBe(false);
    }
  );

  it.each([
    ["hour before spring transition run", "2026-10-03T19:00:00Z", 6],
    ["hour after spring transition run", "2026-10-03T21:00:00Z", 8],
    ["hour before autumn transition run", "2027-04-03T20:00:00Z", 6],
    ["hour after autumn transition run", "2027-04-03T22:00:00Z", 8],
  ])("rejects the %s", (_label, instant, localHour) => {
    const now = new Date(instant);
    expect(sydneyHour(now)).toBe(localHour);
    expect(isSydneyRunHour(now)).toBe(false);
  });

  it("rejects an off-hour instant", () => {
    // 21:00 UTC in January is 08:00 AEDT, not the 7 o'clock hour.
    expect(isSydneyRunHour(new Date("2026-01-11T21:00:00Z"))).toBe(false);
  });
});

describe("decideSchedule", () => {
  it("refuses to run outside the Sydney run hour", () => {
    const d = decideSchedule(new Date("2026-07-11T12:00:00Z"), null);
    expect(d).toEqual({ run: false, reason: "outside-run-hour" });
  });

  it("runs at the run hour when there is no previous run", () => {
    expect(decideSchedule(AEST_7AM, null)).toEqual({ run: true });
  });

  it("blocks a second run inside the interval guard", () => {
    const recent = new Date(AEST_7AM.getTime() - 10 * 3_600_000);
    expect(decideSchedule(AEST_7AM, recent)).toEqual({
      run: false,
      reason: "interval-guard",
    });
  });

  it("runs again once the interval guard has elapsed", () => {
    const old = new Date(
      AEST_7AM.getTime() - (RUN_INTERVAL_GUARD_HOURS + 5) * 3_600_000
    );
    expect(decideSchedule(AEST_7AM, old)).toEqual({ run: true });
  });

  it("force bypasses the run-hour gate but NOT the interval guard", () => {
    const offHour = new Date("2026-07-11T12:00:00Z");
    expect(decideSchedule(offHour, null, { force: true })).toEqual({ run: true });

    const recent = new Date(offHour.getTime() - 10 * 3_600_000);
    expect(decideSchedule(offHour, recent, { force: true })).toEqual({
      run: false,
      reason: "interval-guard",
    });
  });

  it.each([
    {
      transition: "spring-forward",
      now: "2026-10-03T20:00:00Z",
      previousEligibleDay: "2026-10-01T21:00:00Z",
      previousDay: "2026-10-02T21:00:00Z",
    },
    {
      transition: "autumn fallback",
      now: "2027-04-03T21:00:00Z",
      previousEligibleDay: "2027-04-01T20:00:00Z",
      previousDay: "2027-04-02T20:00:00Z",
    },
  ])(
    "keeps the 40h guard correct across $transition",
    ({ now, previousEligibleDay, previousDay }) => {
      expect(decideSchedule(new Date(now), new Date(previousEligibleDay))).toEqual({
        run: true,
      });
      expect(decideSchedule(new Date(now), new Date(previousDay))).toEqual({
        run: false,
        reason: "interval-guard",
      });
    }
  );
});
