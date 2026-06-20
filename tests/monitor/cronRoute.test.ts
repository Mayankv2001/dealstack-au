import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Cron route gate tests — offline. The DB/network deps are mocked so the test
 * exercises ONLY the route's auth + env + compliance gating and that runMonitor
 * is called (in write mode) exactly when, and only when, every gate passes.
 */

// Hoisted so the vi.mock factories below can reference them.
const { runMonitorMock, isApprovedMock } = vi.hoisted(() => ({
  runMonitorMock: vi.fn(),
  isApprovedMock: vi.fn(),
}));

vi.mock("@/lib/monitor/runMonitor", () => ({ runMonitor: runMonitorMock }));
vi.mock("@/lib/admin/repos/compliance", () => ({
  isMonitoringApproved: isApprovedMock,
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
      error: null,
      sampleItems: [{ sourceNativeId: "n1", rawTitle: "secret-ish raw title" }],
    },
  ],
};

beforeEach(() => {
  runMonitorMock.mockReset();
  isApprovedMock.mockReset();
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

  it("returns 200 disabled:true (no fetch) when OZB_MONITOR_ENABLED is not 'true'", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_MONITOR_ENABLED", "false");

    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.disabled).toBe(true);
    expect(body.ran).toBe(false);
    // Disabled short-circuits before the compliance read and any fetch.
    expect(isApprovedMock).not.toHaveBeenCalled();
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
    expect(body.blockedByCompliance).toBe(true);
    expect(body.ran).toBe(false);
    expect(runMonitorMock).not.toHaveBeenCalled();
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
    expect(deps.config.maxFeedsPerRun).toBe(1); // default first-version cap
    expect(deps.persistence).toBeDefined();
    expect(typeof deps.persistence.upsertFeedItems).toBe("function");
    expect(typeof deps.selectFeeds).toBe("function");
  });
});
