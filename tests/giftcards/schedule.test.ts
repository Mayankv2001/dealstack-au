import { describe, expect, it } from "vitest";
import {
  decideDailyLifecycleSchedule,
  decideSchedule,
  isSydneyRunHour,
  RUN_INTERVAL_GUARD_HOURS,
  sydneyHour,
  sydneyLocalDate,
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

/**
 * TASK-16a scaffolding — dual-UTC-slot idempotency and exact interval-guard
 * boundaries, exercising the real schedule module (no duplicated logic).
 *
 * The external scheduler fires DAILY at both 20:00 and 21:00 UTC. On any given
 * Sydney calendar day exactly ONE of those instants is the 7 o'clock local hour
 * (the offset decides which), so the run-hour gate is the primary dedup and the
 * ≥RUN_INTERVAL_GUARD_HOURS guard is the backstop that enforces "every other
 * local day" even if both slots were ever eligible near a transition.
 */
describe("dual UTC cron slots — exactly one run per Sydney day", () => {
  it.each([
    // AEST (UTC+10): the 21:00 UTC slot is 7am; the 20:00 UTC slot is 6am.
    {
      season: "AEST (2026-07)",
      runSlot: "2026-07-13T21:00:00Z",
      offSlot: "2026-07-13T20:00:00Z",
      offLocalHour: 6,
    },
    // AEDT (UTC+11): the 20:00 UTC slot is 7am; the 21:00 UTC slot is 8am.
    {
      season: "AEDT (2026-11)",
      runSlot: "2026-11-09T20:00:00Z",
      offSlot: "2026-11-09T21:00:00Z",
      offLocalHour: 8,
    },
  ])(
    "under $season only the run-hour slot is accepted; the other is off-hour",
    ({ runSlot, offSlot, offLocalHour }) => {
      expect(isSydneyRunHour(new Date(runSlot))).toBe(true);
      expect(sydneyHour(new Date(offSlot))).toBe(offLocalHour);
      expect(decideSchedule(new Date(runSlot), null)).toEqual({ run: true });
      expect(decideSchedule(new Date(offSlot), null)).toEqual({
        run: false,
        reason: "outside-run-hour",
      });
    }
  );

  it("blocks the next day's run once the accepted slot has run (every-other-day)", () => {
    // AEST: 7am on 2026-07-14 runs (no prior run).
    const day1 = new Date("2026-07-13T21:00:00Z");
    expect(decideSchedule(day1, null)).toEqual({ run: true });
    // Next Sydney day's 7am slot is only ~24h later → guarded off.
    const day2 = new Date("2026-07-14T21:00:00Z");
    expect(decideSchedule(day2, day1)).toEqual({
      run: false,
      reason: "interval-guard",
    });
    // The day after (~48h) clears the guard → runs again.
    const day3 = new Date("2026-07-15T21:00:00Z");
    expect(decideSchedule(day3, day1)).toEqual({ run: true });
  });
});

describe("interval guard — exact RUN_INTERVAL_GUARD_HOURS boundary", () => {
  const now = AEST_7AM; // a genuine Sydney run-hour instant
  const minutesBefore = (mins: number) =>
    new Date(now.getTime() - mins * 60_000);

  it("blocks at 39h59m (just inside the guard)", () => {
    expect(
      decideSchedule(now, minutesBefore(RUN_INTERVAL_GUARD_HOURS * 60 - 1))
    ).toEqual({ run: false, reason: "interval-guard" });
  });

  it("runs at 40h01m (just outside the guard)", () => {
    expect(
      decideSchedule(now, minutesBefore(RUN_INTERVAL_GUARD_HOURS * 60 + 1))
    ).toEqual({ run: true });
  });

  it("runs at exactly the guard threshold (guard is strict <)", () => {
    expect(
      decideSchedule(now, minutesBefore(RUN_INTERVAL_GUARD_HOURS * 60))
    ).toEqual({ run: true });
  });
});

describe("daily Sydney lifecycle schedule", () => {
  it.each([
    ["AEST", "2026-07-14T21:07:00Z", "2026-07-15", "2026-07-14T20:07:00Z"],
    ["AEDT", "2026-12-14T20:07:00Z", "2026-12-15", "2026-12-14T21:07:00Z"],
  ])(
    "accepts only the 07:00 local slot under %s",
    (_season, runSlot, localDate, offSlot) => {
      expect(sydneyLocalDate(new Date(runSlot))).toBe(localDate);
      expect(decideDailyLifecycleSchedule(new Date(runSlot), null)).toEqual({
        run: true,
        localDate,
      });
      expect(decideDailyLifecycleSchedule(new Date(offSlot), null)).toEqual({
        run: false,
        localDate,
        reason: "outside-run-hour",
      });
    },
  );

  it("is DST-safe on the 2026-10-04 spring-forward day", () => {
    const run = new Date("2026-10-03T20:07:00Z");
    expect(sydneyLocalDate(run)).toBe("2026-10-04");
    expect(decideDailyLifecycleSchedule(run, null)).toEqual({
      run: true,
      localDate: "2026-10-04",
    });
    expect(
      decideDailyLifecycleSchedule(
        new Date("2026-10-03T21:07:00Z"),
        null,
      ),
    ).toEqual({
      run: false,
      localDate: "2026-10-04",
      reason: "outside-run-hour",
    });
  });

  it("blocks a second invocation on the same Sydney local day", () => {
    const first = new Date("2026-07-14T21:07:00Z");
    const forcedRetry = new Date("2026-07-15T02:00:00Z");
    expect(
      decideDailyLifecycleSchedule(forcedRetry, first, { force: true }),
    ).toEqual({
      run: false,
      localDate: "2026-07-15",
      reason: "already-ran-local-day",
    });
  });

  it("force bypasses only the hour and never the local-day guard", () => {
    const offHour = new Date("2026-07-15T02:00:00Z");
    expect(decideDailyLifecycleSchedule(offHour, null, { force: true })).toEqual({
      run: true,
      localDate: "2026-07-15",
    });
    const sameDay = new Date("2026-07-14T21:07:00Z");
    expect(
      decideDailyLifecycleSchedule(offHour, sameDay, { force: true }),
    ).toMatchObject({ run: false, reason: "already-ran-local-day" });
  });
});
