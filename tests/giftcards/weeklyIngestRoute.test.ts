import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cronSecret: vi.fn(),
  ingestEnabled: vi.fn(),
  maxItems: vi.fn(),
  userAgent: vi.fn(),
  getSource: vi.fn(),
  startRun: vi.fn(),
  lastStart: vi.fn(),
  fetchPage: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  cronSecret: mocks.cronSecret,
  pointHacksWeeklyIngestEnabled: mocks.ingestEnabled,
  pointHacksWeeklyMaxItems: mocks.maxItems,
  pointHacksWeeklyUserAgent: mocks.userAgent,
}));
vi.mock("@/lib/admin/repos/giftCardPipeline", () => ({
  getGiftCardSource: mocks.getSource,
  startIngestRun: mocks.startRun,
  lastIngestRunStart: mocks.lastStart,
  failIngestRun: vi.fn(),
  finishIngestRun: vi.fn(),
  loadRawItems: vi.fn(),
  insertRawItem: vi.fn(),
  updateRawItem: vi.fn(),
  touchRawItem: vi.fn(),
  stageCandidate: vi.fn(),
  recordSourceState: vi.fn(),
}));
vi.mock("@/lib/giftcards/fetchEditorialPage", () => ({
  fetchPointHacksWeeklyPage: mocks.fetchPage,
}));
vi.mock("@/lib/observability/report-server-error", () => ({
  reportOperationalError: mocks.report,
}));

import { GET } from "@/app/api/cron/gift-card-weekly-ingest/route";

const SECRET = "weekly-secret";
const request = (token = SECRET) =>
  new Request("https://dealstack.test/api/cron/gift-card-weekly-ingest?force=1", {
    headers: { authorization: `Bearer ${token}` },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cronSecret.mockReturnValue(SECRET);
  mocks.ingestEnabled.mockReturnValue(true);
  mocks.maxItems.mockReturnValue(20);
  mocks.userAgent.mockReturnValue("DealStackAU/1.0");
});

describe("weekly gift-card ingest permission gates", () => {
  it("requires cron authentication before consulting source state", async () => {
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.getSource).not.toHaveBeenCalled();
  });

  it("does not access DB or network when the environment switch is off", async () => {
    mocks.ingestEnabled.mockReturnValue(false);
    const response = await GET(request());
    expect(await response.json()).toMatchObject({
      ran: false,
      skipped: "environment-disabled",
    });
    expect(mocks.getSource).not.toHaveBeenCalled();
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });

  it.each([
    ["source-disabled", { enabled: false, automated_fetch_allowed: true, terms_checked_at: "2026-07-01", robots_checked_at: "2026-07-01" }],
    ["fetch-not-permitted", { enabled: true, automated_fetch_allowed: false, terms_checked_at: "2026-07-01", robots_checked_at: "2026-07-01" }],
    ["permission-review-incomplete", { enabled: true, automated_fetch_allowed: true, terms_checked_at: null, robots_checked_at: null }],
  ])("skips as %s before acquiring a run lock", async (reason, state) => {
    mocks.getSource.mockResolvedValue({
      id: "pointhacks_weekly_gift_cards",
      feed_url: "https://www.pointhacks.com.au/weekly-gift-card-offers/",
      etag: null,
      last_modified: null,
      ...state,
    });
    const response = await GET(request());
    expect(await response.json()).toMatchObject({ ran: false, skipped: reason });
    expect(mocks.startRun).not.toHaveBeenCalled();
    expect(mocks.fetchPage).not.toHaveBeenCalled();
  });
});
