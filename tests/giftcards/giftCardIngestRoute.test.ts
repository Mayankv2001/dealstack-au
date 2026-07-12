import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate-ordering guarantees for the gift-card ingest cron route. `?force=1` is a
 * manual-run convenience that bypasses ONLY the Sydney run-hour gate — it must
 * never bypass the CRON_SECRET, the GCDB_INGEST_ENABLED master switch, or the
 * DB source enable/automated-fetch permissions. Proven by asserting the lock
 * (startIngestRun) is never even reached when a gate is closed.
 */

const mocks = vi.hoisted(() => ({
  cronSecret: vi.fn(),
  gcdbIngestEnabled: vi.fn(),
  gcdbRssUrl: vi.fn(),
  gcdbUserAgent: vi.fn(),
  gcdbMaxItemsPerRun: vi.fn(),
  getGiftCardSource: vi.fn(),
  startIngestRun: vi.fn(),
  lastIngestRunStart: vi.fn(),
  finishIngestRun: vi.fn(),
  failIngestRun: vi.fn(),
  loadRawItems: vi.fn(),
  insertRawItem: vi.fn(),
  updateRawItem: vi.fn(),
  touchRawItem: vi.fn(),
  stageCandidate: vi.fn(),
  recordSourceState: vi.fn(),
  fetchFeed: vi.fn(),
  reportOperationalError: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  cronSecret: mocks.cronSecret,
  gcdbIngestEnabled: mocks.gcdbIngestEnabled,
  gcdbRssUrl: mocks.gcdbRssUrl,
  gcdbUserAgent: mocks.gcdbUserAgent,
  gcdbMaxItemsPerRun: mocks.gcdbMaxItemsPerRun,
}));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  getGiftCardSource: mocks.getGiftCardSource,
  startIngestRun: mocks.startIngestRun,
  lastIngestRunStart: mocks.lastIngestRunStart,
  finishIngestRun: mocks.finishIngestRun,
  failIngestRun: mocks.failIngestRun,
  loadRawItems: mocks.loadRawItems,
  insertRawItem: mocks.insertRawItem,
  updateRawItem: mocks.updateRawItem,
  touchRawItem: mocks.touchRawItem,
  stageCandidate: mocks.stageCandidate,
  recordSourceState: mocks.recordSourceState,
}));
vi.mock("@/lib/monitor/fetchFeed", () => ({ fetchFeed: mocks.fetchFeed }));
vi.mock("@/lib/observability/report-server-error", () => ({
  reportOperationalError: mocks.reportOperationalError,
}));

import { GET } from "@/app/api/cron/gift-card-ingest/route";

const SECRET = "test-cron-secret";
const forcedRequest = (auth?: string) =>
  new Request("https://dealstack.test/api/cron/gift-card-ingest?force=1", {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cronSecret.mockReturnValue(SECRET);
  mocks.gcdbIngestEnabled.mockReturnValue(true);
  mocks.gcdbRssUrl.mockReturnValue(null);
  mocks.gcdbUserAgent.mockReturnValue("dealstack-bot (+https://dealstack.test)");
  mocks.gcdbMaxItemsPerRun.mockReturnValue(40);
});

describe("gift-card ingest route — ?force=1 cannot bypass auth", () => {
  it("rejects a forced call with no bearer token", async () => {
    const res = await GET(forcedRequest());
    expect(res.status).toBe(401);
    expect(mocks.getGiftCardSource).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it("rejects a forced call with the wrong bearer token", async () => {
    const res = await GET(forcedRequest("Bearer not-the-secret"));
    expect(res.status).toBe(401);
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
  });
});

describe("gift-card ingest route — ?force=1 cannot bypass env/source gates", () => {
  it("does not run when GCDB_INGEST_ENABLED is false (no DB, no network)", async () => {
    mocks.gcdbIngestEnabled.mockReturnValue(false);
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ran: false, skipped: "disabled" });
    expect(mocks.getGiftCardSource).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
  });

  it("does not run when the DB source row is disabled", async () => {
    mocks.getGiftCardSource.mockResolvedValue({
      id: "gcdb",
      feed_url: "https://gcdb.com.au/feed/",
      enabled: false,
      automated_fetch_allowed: true,
      etag: null,
      last_modified: null,
    });
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(body).toMatchObject({ ran: false, skipped: "source-disabled" });
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it("does not run when automated_fetch_allowed is false", async () => {
    mocks.getGiftCardSource.mockResolvedValue({
      id: "gcdb",
      feed_url: "https://gcdb.com.au/feed/",
      enabled: true,
      automated_fetch_allowed: false,
      etag: null,
      last_modified: null,
    });
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(body).toMatchObject({ ran: false, skipped: "source-disabled" });
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
  });

  it("returns 503 when CRON_SECRET is not configured, even when forced", async () => {
    mocks.cronSecret.mockReturnValue(null);
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
  });
});
