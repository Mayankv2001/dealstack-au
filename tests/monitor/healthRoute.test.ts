import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { snapshotMock } = vi.hoisted(() => ({ snapshotMock: vi.fn() }));
vi.mock("@/lib/admin/repos/monitorStatus", () => ({
  getMonitorHealthSnapshot: snapshotMock,
}));

import { GET } from "@/app/api/health/monitor/route";

const SECRET = "health-test-secret";
function request(token?: string) {
  return new Request("https://app.example/api/health/monitor", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  snapshotMock.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/monitor", () => {
  it("does no DB work when the secret is absent or authentication fails", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request(SECRET))).status).toBe(503);
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(snapshotMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ envEnabled: false, complianceApproved: false, fetchableEnabledFeedCount: 0, lastSuccessAt: null }, 200, "off"],
    [{ envEnabled: true, complianceApproved: true, fetchableEnabledFeedCount: 0, lastSuccessAt: null }, 200, "paused"],
    [{ envEnabled: true, complianceApproved: false, fetchableEnabledFeedCount: 1, lastSuccessAt: null }, 503, undefined],
  ] as const)("serializes a safe health state", async (snapshot, status, monitoring) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    snapshotMock.mockResolvedValue(snapshot);
    const res = await GET(request(SECRET));
    expect(res.status).toBe(status);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.monitoring).toBe(monitoring);
    expect(JSON.stringify(body)).not.toContain("feedUrl");
  });

  it("returns a generic no-store 503 when state reads fail", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    snapshotMock.mockImplementation(() => {
      throw new Error("secret table detail");
    });
    const res = await GET(request(SECRET));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await res.json())).not.toContain("secret table detail");
    expect(errorLog).toHaveBeenCalledOnce();
    errorLog.mockRestore();
  });
});
