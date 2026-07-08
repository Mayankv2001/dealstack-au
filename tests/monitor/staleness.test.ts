import { describe, expect, it } from "vitest";
import {
  isMonitorStale,
  MONITOR_STALE_HOURS,
} from "../../lib/monitor/staleness";

const NOW = new Date("2026-07-08T12:00:00.000Z");
const hoursBefore = (h: number): string =>
  new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("isMonitorStale", () => {
  it("is never stale when no enabled fetch-approved feeds exist", () => {
    // Emergency-stop / registry-only states: no runs are EXPECTED, so silence
    // is intended, not an incident — even when nothing ever succeeded.
    expect(
      isMonitorStale({ fetchableEnabledFeedCount: 0, lastSuccessAt: null, now: NOW })
    ).toBe(false);
    expect(
      isMonitorStale({
        fetchableEnabledFeedCount: 0,
        lastSuccessAt: hoursBefore(1000),
        now: NOW,
      })
    ).toBe(false);
  });

  it("is stale when feeds expect fetching but no run ever succeeded", () => {
    expect(
      isMonitorStale({ fetchableEnabledFeedCount: 1, lastSuccessAt: null, now: NOW })
    ).toBe(true);
  });

  it("is not stale when the last success is younger than the threshold", () => {
    expect(
      isMonitorStale({
        fetchableEnabledFeedCount: 2,
        lastSuccessAt: hoursBefore(29),
        now: NOW,
      })
    ).toBe(false);
  });

  it("is stale when the last success is older than the threshold", () => {
    expect(
      isMonitorStale({
        fetchableEnabledFeedCount: 2,
        lastSuccessAt: hoursBefore(31),
        now: NOW,
      })
    ).toBe(true);
  });

  it("treats exactly the threshold age as stale (inclusive boundary)", () => {
    // age === threshold → !(age < threshold) → stale.
    expect(
      isMonitorStale({
        fetchableEnabledFeedCount: 1,
        lastSuccessAt: hoursBefore(MONITOR_STALE_HOURS),
        now: NOW,
      })
    ).toBe(true);
  });

  it("treats an unparseable timestamp as stale (NaN lands on the stale side)", () => {
    expect(
      isMonitorStale({
        fetchableEnabledFeedCount: 1,
        lastSuccessAt: "not-a-timestamp",
        now: NOW,
      })
    ).toBe(true);
  });

  it("honours a custom threshold", () => {
    const opts = {
      fetchableEnabledFeedCount: 1,
      lastSuccessAt: hoursBefore(5),
      now: NOW,
    };
    expect(isMonitorStale({ ...opts, thresholdHours: 4 })).toBe(true);
    expect(isMonitorStale({ ...opts, thresholdHours: 6 })).toBe(false);
  });
});
