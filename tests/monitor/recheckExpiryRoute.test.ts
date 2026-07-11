import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Expiry-recheck cron route gate tests — offline. All DB/network deps are
 * mocked so this exercises ONLY the route's auth + master-switch + compliance
 * gating, the overlapping-run skip, and that no secret or raw internal error is
 * ever echoed back.
 */

const { runRecheckMock, isApprovedMock, reportMock } = vi.hoisted(() => ({
  runRecheckMock: vi.fn(),
  isApprovedMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("@/lib/monitor/runRecheckExpiry", () => ({
  runRecheckExpiry: runRecheckMock,
}));
vi.mock("@/lib/admin/repos/compliance", () => ({
  isMonitoringApproved: isApprovedMock,
}));
// Keep the route import from pulling in the real Supabase client / networked probe.
vi.mock("@/lib/admin/repos/recheckExpiry", () => ({
  startRecheckRun: vi.fn(),
  finishRecheckRun: vi.fn(),
  listRecheckCandidates: vi.fn(),
  archiveRecheckItem: vi.fn(),
  stampRecheckItem: vi.fn(),
}));
vi.mock("@/lib/monitor/validateSourcePost", () => ({
  classifySourcePost: vi.fn(),
}));
vi.mock("@/lib/observability/report-server-error", () => ({
  reportOperationalError: reportMock,
}));

import { GET } from "@/app/api/cron/recheck-ozbargain-expiry/route";

const SECRET = "test-cron-secret";
const UA = "DealStackAU/1.0 (+https://example/about; contact: a@b.c)";

function makeRequest(authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request("https://app.example/api/cron/recheck-ozbargain-expiry", {
    headers,
  });
}

const okMetrics = {
  started: true as const,
  metrics: {
    runId: "run-1",
    status: "ok" as const,
    dryRun: true,
    scanned: 5,
    active: 3,
    expired: 0,
    deleted: 1,
    unknown: 1,
    fetchFailed: 0,
    wouldArchive: 1,
    actuallyArchived: 0,
    skipped: 0,
    errors: [],
  },
};

beforeEach(() => {
  runRecheckMock.mockReset().mockResolvedValue(okMetrics);
  isApprovedMock.mockReset().mockResolvedValue(true);
  reportMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/cron/recheck-ozbargain-expiry", () => {
  it("returns 503 and does nothing when CRON_SECRET is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(isApprovedMock).not.toHaveBeenCalled();
    expect(runRecheckMock).not.toHaveBeenCalled();
  });

  it("returns 401 on a wrong or missing bearer token", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(makeRequest("Bearer wrong"))).status).toBe(401);
    expect((await GET(makeRequest())).status).toBe(401);
    expect(runRecheckMock).not.toHaveBeenCalled();
  });

  it("skips as disabled (no DB/network) when the master switch is off", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "false");
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ran: false, skipped: "disabled" });
    expect(isApprovedMock).not.toHaveBeenCalled();
    expect(runRecheckMock).not.toHaveBeenCalled();
  });

  it("skips as blocked-by-compliance when no review is approved", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    isApprovedMock.mockResolvedValue(false);
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      ran: false,
      skipped: "blocked-by-compliance",
    });
    expect(runRecheckMock).not.toHaveBeenCalled();
  });

  it("returns 500 (generic) when the user agent is not configured", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", "");
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(runRecheckMock).not.toHaveBeenCalled();
  });

  it("runs and returns safe structured JSON when all gates pass", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      ran: true,
      runId: "run-1",
      status: "ok",
      dryRun: true,
      scanned: 5,
      wouldArchive: 1,
      actuallyArchived: 0,
      errorCount: 0,
    });
    // The raw internal error array is never serialised.
    expect(JSON.stringify(body)).not.toContain("\"errors\"");
    expect(runRecheckMock).toHaveBeenCalledTimes(1);
  });

  it("defaults to preview (dry-run) — passes dryRun:true to the runner", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    // OZB_EXPIRY_RECHECK_DRY_RUN unset → preview.
    await GET(makeRequest(`Bearer ${SECRET}`));
    const [config] = runRecheckMock.mock.calls[0];
    expect(config.dryRun).toBe(true);
  });

  it("goes live only when dry-run is explicitly false", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_EXPIRY_RECHECK_DRY_RUN", "false");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    await GET(makeRequest(`Bearer ${SECRET}`));
    const [config] = runRecheckMock.mock.calls[0];
    expect(config.dryRun).toBe(false);
  });

  it("reports the overlapping-run skip cleanly", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    runRecheckMock.mockResolvedValue({
      started: false,
      reason: "already-running",
    });
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      ran: false,
      skipped: "already-running",
    });
  });

  it("never echoes a raw internal error message on failure", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("OZB_EXPIRY_RECHECK_ENABLED", "true");
    vi.stubEnv("OZB_MONITOR_USER_AGENT", UA);
    runRecheckMock.mockRejectedValue(new Error("supabase connection string leaked"));
    const res = await GET(makeRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("supabase");
    expect(body.error).toBe("recheck run failed");
    expect(reportMock).toHaveBeenCalled();
  });
});
