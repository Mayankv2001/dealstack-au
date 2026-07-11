import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cron route gate tests — offline. The DB/network deps are mocked so the test
 * exercises ONLY the route's auth + env + compliance gating and that runMonitor
 * is called (in write mode) exactly when, and only when, every gate passes.
 */

// Hoisted so the vi.mock factories below can reference them.
const {
  runMonitorMock,
  isApprovedMock,
  archiveExpiredMock,
  validatePublishedMock,
  startRunMock,
  finishRunMock,
  runDetectionMock,
} = vi.hoisted(() => ({
  runMonitorMock: vi.fn(),
  isApprovedMock: vi.fn(),
  archiveExpiredMock: vi.fn(),
  validatePublishedMock: vi.fn(),
  startRunMock: vi.fn(),
  finishRunMock: vi.fn(),
  runDetectionMock: vi.fn(),
}));

vi.mock("@/lib/monitor/runMonitor", () => ({ runMonitor: runMonitorMock }));
vi.mock("@/lib/admin/repos/compliance", () => ({
  isMonitoringApproved: isApprovedMock,
}));
vi.mock("@/lib/admin/repos/dailyPipeline", () => ({
  archiveExpiredDeals: archiveExpiredMock,
  validatePublishedSignals: validatePublishedMock,
  startPipelineRun: startRunMock,
  finishPipelineRun: finishRunMock,
}));
// These are wired into runMonitor's deps; mock them so importing the route never
// pulls in the real Supabase client chain or the networked fetcher.
vi.mock("@/lib/monitor/fetchFeed", () => ({ fetchFeed: vi.fn() }));
vi.mock("@/lib/admin/repos/feedSources", () => ({
  listDueEnabledFeeds: vi.fn(),
  upsertFeedItems: vi.fn(),
  recordFeedPollState: vi.fn(),
  insertFeedFetchLog: vi.fn(),
}));
vi.mock("@/lib/monitor/runDetection", () => ({
  runDetection: runDetectionMock,
}));
vi.mock("@/lib/admin/repos/offerChanges", () => ({
  createDetectionPersistence: vi.fn(() => ({})),
}));

import { GET } from "@/app/api/cron/monitor-feeds/route";

const SECRET = "test-cron-secret";
const UA = "DealStackAU/1.0 (+https://example/about; contact: a@b.c)";

function makeRequest(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request("https://app.example/api/cron/monitor-feeds", { headers });
}

const okSummary = {
  enabled: true,
  dryRun: false,
  feedsConsidered: 1,
  feedsProcessed: 1,
  results: [
    {
      feedId: "feed-1",
      label: "Test feed",
      feedUrl: "https://example.com/feed.xml",
      status: "ok",
      httpStatus: 200,
      itemsSeen: 3,
      itemsNew: 2,
      itemsUpdated: 0,
      itemsSkipped: 1,
      error: null,
      sampleItems: [{ sourceNativeId: "n1", rawTitle: "secret-ish raw title" }],
    },
  ],
};

beforeEach(() => {
  runMonitorMock.mockReset();
  isApprovedMock.mockReset();
  archiveExpiredMock.mockReset().mockResolvedValue({ total: 1 });
  validatePublishedMock.mockReset().mockResolvedValue({
    checked: 2,
    archived: 0,
    unknown: 0,
  });
  startRunMock
    .mockReset()
    .mockResolvedValue({ started: true, runId: "run-1" });
  finishRunMock.mockReset().mockResolvedValue(undefined);
  runDetectionMock.mockReset().mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/monitor-feeds", () => {
  it("returns 503 and does not run when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(isApprovedMock).not.toHaveBeenCalled();
    expect(runMonitorMock).not.toHaveBeenCalled();
  });

  it("returns 401 on a wrong or missing bearer token", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    const wrong = await GET(makeRequest("Bearer wrong-secret"));
    expect(wrong.status).toBe(401);

    const none = await GET(makeRequest());
    expect(none.status).toBe(401);

    expect(runMonitorMock).not.toHaveBeenCalled();
  });

  it("still archives expiry but does no network work when monitoring is disabled", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "false");

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("disabled");
    expect(body.ran).toBe(true);
    expect(body.expiredArchived).toBe(1);
    expect(archiveExpiredMock).toHaveBeenCalledOnce();
    expect(runMonitorMock).not.toHaveBeenCalled();
  });

  it("returns 200 blockedByCompliance:true (no fetch) when no review is approved", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    isApprovedMock.mockResolvedValue(false);

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("blocked");
    expect(body.ran).toBe(true);
    expect(archiveExpiredMock).toHaveBeenCalledOnce();
    expect(runMonitorMock).not.toHaveBeenCalled();
  });

  it("does not run offer detection when the feed phase is compliance-blocked", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "true");
    vi.stubEnv("OZB_OFFER_DETECT_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    isApprovedMock.mockResolvedValue(false);

    await GET(makeRequest(`Bearer ${SECRET}`));

    expect(runDetectionMock).not.toHaveBeenCalled();
  });

  it("returns 500 and records the run when the compliance check fails", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "true");
    isApprovedMock.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await GET(makeRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect((await response.json()).status).toBe("error");
    expect(archiveExpiredMock).toHaveBeenCalledOnce();
    expect(runMonitorMock).not.toHaveBeenCalled();
    expect(finishRunMock).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ status: "error" }),
      expect.any(Date)
    );
  });

  it("runs the monitor in WRITE mode when all gates pass (happy path)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    isApprovedMock.mockResolvedValue(true);
    runMonitorMock.mockResolvedValue(okSummary);

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.ran).toBe(true);
    expect(body.feedsProcessed).toBe(1);
    // Raw item content must not be echoed back in the response.
    expect(JSON.stringify(body)).not.toContain("secret-ish raw title");

    expect(runMonitorMock).toHaveBeenCalledTimes(1);
    const [options, deps] = runMonitorMock.mock.calls[0];
    expect(options).toMatchObject({ dryRun: false });
    expect(deps.config.maxFeedsPerRun).toBe(10);
    expect(deps.persistence).toBeDefined();
    expect(typeof deps.persistence.upsertFeedItems).toBe("function");
    expect(typeof deps.selectFeeds).toBe("function");
  });

  it("skips the whole pipeline and returns 200 when another run is in flight", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    isApprovedMock.mockResolvedValue(true);
    startRunMock.mockResolvedValue({
      started: false,
      reason: "already-running",
    });

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, ran: false, skipped: "already-running" });

    expect(archiveExpiredMock).not.toHaveBeenCalled();
    expect(validatePublishedMock).not.toHaveBeenCalled();
    expect(runMonitorMock).not.toHaveBeenCalled();
    expect(finishRunMock).not.toHaveBeenCalled();
    expect(runDetectionMock).not.toHaveBeenCalled();
  });
});
