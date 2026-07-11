import { describe, expect, it } from "vitest";
import {
  deriveMonitorHealth,
  summarizeFetchHealth,
} from "@/lib/monitor/health";

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

  it("fails when the expected daily pipeline has never run or is stale", () => {
    expect(
      deriveMonitorHealth({
        ...base,
        pipelineExpected: true,
        latestPipelineAt: null,
      })
    ).toMatchObject({ ok: false, reason: "pipeline-stale" });
    expect(
      deriveMonitorHealth({
        ...base,
        pipelineExpected: true,
        latestPipelineAt: "2026-07-09T09:59:59.000Z",
      })
    ).toMatchObject({ ok: false, reason: "pipeline-stale" });
  });

  it("fails a stuck or partial pipeline before considering feed health", () => {
    expect(
      deriveMonitorHealth({
        ...base,
        pipelineExpected: true,
        latestPipelineAt: "2026-07-10T11:00:00.000Z",
        latestPipelineStatus: "running",
        runningPipelineStartedAt: "2026-07-10T11:30:00.000Z",
      })
    ).toMatchObject({ ok: false, reason: "pipeline-stuck" });
    expect(
      deriveMonitorHealth({
        ...base,
        pipelineExpected: true,
        latestPipelineAt: "2026-07-10T11:00:00.000Z",
        latestPipelineStatus: "partial",
      })
    ).toMatchObject({ ok: false, reason: "pipeline-failed" });
  });

  it.each([
    [{ consecutiveParserFailures: 3 }, "parser-failures"],
    [{ autoDisabledFeedCount: 1 }, "feeds-auto-disabled"],
    [{ fetchAnomaly: "zero-collapse" as const }, "fetch-anomaly"],
    [{ duplicateRunCount: 1 }, "duplicate-runs"],
  ])("reports operational condition %#", (condition, reason) => {
    expect(
      deriveMonitorHealth({
        ...base,
        pipelineExpected: true,
        latestPipelineAt: "2026-07-10T11:00:00.000Z",
        latestPipelineStatus: "ok",
        ...condition,
      })
    ).toMatchObject({ ok: false, reason });
  });
});

describe("summarizeFetchHealth", () => {
  it("counts consecutive parser failures per source despite interleaved logs", () => {
    expect(
      summarizeFetchHealth([
        { feedSourceId: "a", error: "feed XML parse failed: bad", itemsSeen: 0 },
        { feedSourceId: "b", error: null, itemsSeen: 20 },
        { feedSourceId: "a", error: "feed XML parse failed: bad", itemsSeen: 0 },
        { feedSourceId: "a", error: "feed XML parse failed: bad", itemsSeen: 0 },
      ]).consecutiveParserFailures
    ).toBe(3);
  });

  it("detects count anomalies within one source, not across different feeds", () => {
    expect(
      summarizeFetchHealth([
        { feedSourceId: "a", error: null, itemsSeen: 0 },
        { feedSourceId: "b", error: null, itemsSeen: 100 },
        { feedSourceId: "a", error: null, itemsSeen: 12 },
      ]).fetchAnomaly
    ).toBe("zero-collapse");
    expect(
      summarizeFetchHealth([
        { feedSourceId: "a", error: null, itemsSeen: 2 },
        { feedSourceId: "b", error: null, itemsSeen: 100 },
      ]).fetchAnomaly
    ).toBeNull();
  });
});
