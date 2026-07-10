import { describe, expect, it } from "vitest";
import { deriveMonitorHealth } from "@/lib/monitor/health";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const base = {
  envEnabled: true,
  complianceApproved: true,
  fetchableEnabledFeedCount: 1,
  lastSuccessAt: "2026-07-10T11:00:00.000Z",
  now: NOW,
};

describe("deriveMonitorHealth", () => {
  it("treats an intentionally disabled monitor as healthy", () => {
    expect(deriveMonitorHealth({ ...base, envEnabled: false, lastSuccessAt: null })).toEqual({
      ok: true,
      monitoring: "off",
    });
  });

  it("fails when enabled without compliance approval", () => {
    expect(deriveMonitorHealth({ ...base, complianceApproved: false })).toEqual({
      ok: false,
      reason: "compliance",
    });
  });

  it("treats zero fetchable sources as intentionally paused", () => {
    expect(
      deriveMonitorHealth({ ...base, fetchableEnabledFeedCount: 0, lastSuccessAt: null })
    ).toEqual({ ok: true, monitoring: "paused" });
  });

  it("is fresh immediately before 30 hours and stale exactly at 30 hours", () => {
    const fresh = new Date(NOW.getTime() - (30 * 60 * 60 * 1000 - 1)).toISOString();
    const stale = new Date(NOW.getTime() - 30 * 60 * 60 * 1000).toISOString();
    expect(deriveMonitorHealth({ ...base, lastSuccessAt: fresh }).ok).toBe(true);
    expect(deriveMonitorHealth({ ...base, lastSuccessAt: stale })).toMatchObject({
      ok: false,
      reason: "stale",
      thresholdHours: 30,
    });
  });

  it.each([null, "not-a-date"])("treats %s as stale when runs are expected", (value) => {
    expect(deriveMonitorHealth({ ...base, lastSuccessAt: value })).toMatchObject({
      ok: false,
      reason: "stale",
    });
  });

  it("treats a future timestamp as fresh", () => {
    expect(
      deriveMonitorHealth({ ...base, lastSuccessAt: "2026-07-11T00:00:00.000Z" })
    ).toMatchObject({ ok: true, monitoring: "on" });
  });
});
