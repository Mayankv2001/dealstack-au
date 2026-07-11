import { describe, expect, it, vi } from "vitest";
import { runDailyPipeline } from "@/lib/monitor/runDailyPipeline";
import type { StartRunOutcome } from "@/lib/admin/repos/dailyPipeline";

const NOW = new Date("2026-07-11T00:00:00Z");

function deps() {
  return {
    now: vi.fn(() => NOW),
    startRun: vi.fn(
      async (): Promise<StartRunOutcome> => ({ started: true, runId: "run-1" })
    ),
    finishRun: vi.fn(async () => undefined),
    archiveExpired: vi.fn(async () => ({ total: 2 })),
    validateLive: vi.fn(async () => ({ checked: 4, archived: 1, unknown: 1 })),
    fetchLatest: vi.fn(async () => ({
      enabled: true,
      dryRun: false,
      feedsConsidered: 1,
      feedsProcessed: 1,
      results: [
        {
          feedId: "feed-1",
          label: "OzBargain",
          feedUrl: "https://www.ozbargain.com.au/deals/feed",
          status: "ok" as const,
          httpStatus: 200,
          itemsSeen: 20,
          itemsNew: 5,
          itemsUpdated: 2,
          itemsSkipped: 13,
          error: null,
          sampleItems: [],
        },
      ],
    })),
  };
}

describe("runDailyPipeline", () => {
  it("runs archive -> validate -> fetch and records complete counts", async () => {
    const d = deps();
    const outcome = await runDailyPipeline(
      { monitorEnabled: true, complianceApproved: true, userAgent: "UA" },
      d
    );
    expect(d.archiveExpired.mock.invocationCallOrder[0]).toBeLessThan(
      d.validateLive.mock.invocationCallOrder[0]
    );
    expect(d.validateLive.mock.invocationCallOrder[0]).toBeLessThan(
      d.fetchLatest.mock.invocationCallOrder[0]
    );
    if (!outcome.started) throw new Error("expected the run to start");
    expect(outcome.summary).toMatchObject({
      status: "ok",
      expiredArchived: 2,
      invalidArchived: 1,
      itemsFetched: 20,
      itemsNew: 5,
      itemsUpdated: 2,
      itemsSkipped: 13,
    });
    expect(d.finishRun).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "ok", itemsSkipped: 13 }),
      NOW
    );
  });

  it("still archives expiry when the feed kill switch is off", async () => {
    const d = deps();
    const outcome = await runDailyPipeline(
      { monitorEnabled: false, complianceApproved: false, userAgent: null },
      d
    );
    if (!outcome.started) throw new Error("expected the run to start");
    expect(outcome.summary.status).toBe("disabled");
    expect(d.archiveExpired).toHaveBeenCalledOnce();
    expect(d.validateLive).not.toHaveBeenCalled();
    expect(d.fetchLatest).not.toHaveBeenCalled();
  });

  it("continues to fetch after a validation failure and records partial", async () => {
    const d = deps();
    d.validateLive.mockRejectedValueOnce(new Error("status endpoint down"));
    const outcome = await runDailyPipeline(
      { monitorEnabled: true, complianceApproved: true, userAgent: "UA" },
      d
    );
    expect(d.fetchLatest).toHaveBeenCalledOnce();
    if (!outcome.started) throw new Error("expected the run to start");
    expect(outcome.summary.status).toBe("partial");
    expect(outcome.summary.errors[0]).toMatch(/status endpoint down/);
  });

  it("records a compliance preflight failure as an error, not a normal block", async () => {
    const d = deps();
    const outcome = await runDailyPipeline(
      {
        monitorEnabled: true,
        complianceApproved: false,
        userAgent: null,
        preflightErrors: ["compliance check: database unavailable"],
      },
      d
    );

    if (!outcome.started) throw new Error("expected the run to start");
    expect(outcome.summary.status).toBe("error");
    expect(d.archiveExpired).toHaveBeenCalledOnce();
    expect(d.fetchLatest).not.toHaveBeenCalled();
  });

  it("skips every step and does not write a run row when another run is in flight", async () => {
    const d = deps();
    d.startRun.mockResolvedValueOnce({
      started: false,
      reason: "already-running",
    });
    const outcome = await runDailyPipeline(
      { monitorEnabled: true, complianceApproved: true, userAgent: "UA" },
      d
    );
    expect(outcome).toEqual({ started: false, reason: "already-running" });
    expect(d.archiveExpired).not.toHaveBeenCalled();
    expect(d.validateLive).not.toHaveBeenCalled();
    expect(d.fetchLatest).not.toHaveBeenCalled();
    expect(d.finishRun).not.toHaveBeenCalled();
  });
});
