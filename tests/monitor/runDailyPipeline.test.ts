import { describe, expect, it, vi } from "vitest";
import { runDailyPipeline } from "@/lib/monitor/runDailyPipeline";

const NOW = new Date("2026-07-11T00:00:00Z");

function deps() {
  return {
    now: vi.fn(() => NOW),
    startRun: vi.fn(async () => "run-1"),
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
    const summary = await runDailyPipeline(
      { monitorEnabled: true, complianceApproved: true, userAgent: "UA" },
      d
    );
    expect(d.archiveExpired.mock.invocationCallOrder[0]).toBeLessThan(
      d.validateLive.mock.invocationCallOrder[0]
    );
    expect(d.validateLive.mock.invocationCallOrder[0]).toBeLessThan(
      d.fetchLatest.mock.invocationCallOrder[0]
    );
    expect(summary).toMatchObject({
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
    const summary = await runDailyPipeline(
      { monitorEnabled: false, complianceApproved: false, userAgent: null },
      d
    );
    expect(summary.status).toBe("disabled");
    expect(d.archiveExpired).toHaveBeenCalledOnce();
    expect(d.validateLive).not.toHaveBeenCalled();
    expect(d.fetchLatest).not.toHaveBeenCalled();
  });

  it("continues to fetch after a validation failure and records partial", async () => {
    const d = deps();
    d.validateLive.mockRejectedValueOnce(new Error("status endpoint down"));
    const summary = await runDailyPipeline(
      { monitorEnabled: true, complianceApproved: true, userAgent: "UA" },
      d
    );
    expect(d.fetchLatest).toHaveBeenCalledOnce();
    expect(summary.status).toBe("partial");
    expect(summary.errors[0]).toMatch(/status endpoint down/);
  });

  it("records a compliance preflight failure as an error, not a normal block", async () => {
    const d = deps();
    const summary = await runDailyPipeline(
      {
        monitorEnabled: true,
        complianceApproved: false,
        userAgent: null,
        preflightErrors: ["compliance check: database unavailable"],
      },
      d
    );

    expect(summary.status).toBe("error");
    expect(d.archiveExpired).toHaveBeenCalledOnce();
    expect(d.fetchLatest).not.toHaveBeenCalled();
  });
});
