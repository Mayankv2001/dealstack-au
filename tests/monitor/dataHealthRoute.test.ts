import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ health: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/admin/repos/dataHealth", () => ({ getPublishedDataHealth: mocks.health }));
vi.mock("@/lib/observability/report-server-error", () => ({ reportServerError: mocks.report }));

import { GET } from "@/app/api/health/data/route";

const SECRET = "data-health-secret";
const request = (token?: string) => new Request("https://app.example/api/health/data", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/health/data", () => {
  it("rejects unauthenticated requests before reading data", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.health).not.toHaveBeenCalled();
  });

  it("returns 200 only when every published review interval is current", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.health.mockResolvedValue({ ok: true, totalOverdue: 0, overdueByType: {}, checkedAt: "now" });
    const response = await GET(request(SECRET));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("alerts with a count-only 503 when any type is overdue", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.health.mockResolvedValue({ ok: false, totalOverdue: 2, overdueByType: { cardOffers: 2 }, checkedAt: "now" });
    const response = await GET(request(SECRET));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ totalOverdue: 2 });
  });
});

