import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gate-ordering guarantees for the gift-card ingest cron route. `?force=1` is a
 * manual-run convenience that bypasses ONLY the Sydney run-hour gate — it must
 * never bypass the CRON_SECRET, the GCDB_INGEST_ENABLED master switch, or the
 * DB source enable/automated-fetch permissions or the recorded robots/terms
 * reviews. Proven by asserting the lock (startIngestRun) is never even reached
 * when a gate is closed.
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
  persistRejectedRawItem: vi.fn(),
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
  persistRejectedRawItem: mocks.persistRejectedRawItem,
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
import { GiftCardJobRunSchemaUnavailableError } from "@/lib/admin/repos/giftCardJobRunErrors";

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

const permittedSource = (overrides: Record<string, unknown> = {}) => ({
  id: "gcdb",
  feed_url: "https://gcdb.com.au/feed/",
  enabled: true,
  automated_fetch_allowed: true,
  terms_checked_at: "2026-07-14T00:00:00Z",
  robots_checked_at: "2026-07-14T00:00:00Z",
  etag: null,
  last_modified: null,
  ...overrides,
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
    expect(body).toMatchObject({ ran: false, skipped: "environment-disabled" });
    expect(mocks.getGiftCardSource).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it.each([
    ["source-missing", null],
    ["source-disabled", permittedSource({ enabled: false })],
    [
      "fetch-not-permitted",
      permittedSource({ automated_fetch_allowed: false }),
    ],
    [
      "permission-review-incomplete",
      permittedSource({ terms_checked_at: null }),
    ],
    [
      "permission-review-incomplete",
      permittedSource({ robots_checked_at: null }),
    ],
  ])("does not run when the DB gate is %s", async (reason, source) => {
    mocks.getGiftCardSource.mockResolvedValue(source);
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    const body = await res.json();
    expect(body).toMatchObject({ ran: false, skipped: reason });
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
    expect(mocks.gcdbUserAgent).not.toHaveBeenCalled();
    expect(mocks.lastIngestRunStart).not.toHaveBeenCalled();
  });

  it("reports a source lookup failure instead of misclassifying it as disabled", async () => {
    mocks.getGiftCardSource.mockRejectedValue(new Error("database unavailable"));

    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({
      ok: false,
      ran: false,
      error: "gift-card ingest failed",
    });
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      "gift-card-ingest",
      expect.any(Error),
    );
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });

  it("returns 503 when CRON_SECRET is not configured, even when forced", async () => {
    mocks.cronSecret.mockReturnValue(null);
    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
  });

  it("returns a controlled 503 without an incident when migration 030 is absent", async () => {
    mocks.getGiftCardSource.mockResolvedValue(permittedSource());
    mocks.lastIngestRunStart.mockRejectedValue(
      new GiftCardJobRunSchemaUnavailableError(),
    );

    const res = await GET(forcedRequest(`Bearer ${SECRET}`));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      ok: false,
      ran: false,
      skipped: "schema-unavailable",
    });
    expect(mocks.reportOperationalError).not.toHaveBeenCalled();
    expect(mocks.startIngestRun).not.toHaveBeenCalled();
    expect(mocks.fetchFeed).not.toHaveBeenCalled();
  });
});
