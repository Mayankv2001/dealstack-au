import { describe, expect, it, vi } from "vitest";
import { runMonitor, type MonitorFeed } from "../../lib/monitor/runMonitor";
import type { FetchFeedOutcome } from "../../lib/monitor/fetchFeed";

const FEED: MonitorFeed = {
  id: "feed-1",
  label: "Test feed",
  feedUrl: "https://example.com/feed.xml",
  etag: null,
  lastModified: null,
  failureCount: 0,
};

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Deal A</title><link>https://example.com/a</link><guid>a1</guid></item>
  <item><title>Deal B</title><link>https://example.com/b</link><guid>b2</guid></item>
</channel></rss>`;

const baseConfig = {
  enabled: true,
  userAgent: "DealStackAU/1.0",
  maxFeedsPerRun: 1,
  minIntervalHours: 12,
};

const okOutcome = (): FetchFeedOutcome => ({
  kind: "ok",
  httpStatus: 200,
  body: RSS,
  etag: 'W/"v1"',
  lastModified: null,
});

function makePersistence() {
  return {
    upsertFeedItems: vi.fn(async () => 2),
    recordPollState: vi.fn(async () => {}),
    insertFetchLog: vi.fn(async () => {}),
  };
}

describe("runMonitor — kill switch", () => {
  it("performs no fetch and selects no feeds when disabled", async () => {
    const fetchFeed = vi.fn();
    const selectFeeds = vi.fn();
    const summary = await runMonitor(
      { dryRun: true },
      { config: { ...baseConfig, enabled: false }, selectFeeds, fetchFeed }
    );
    expect(summary.enabled).toBe(false);
    expect(fetchFeed).not.toHaveBeenCalled();
    expect(selectFeeds).not.toHaveBeenCalled();
  });
});

describe("runMonitor — dry run", () => {
  it("fetches and parses but writes nothing", async () => {
    const fetchFeed = vi.fn(async () => okOutcome());
    const persistence = makePersistence();
    const summary = await runMonitor(
      { dryRun: true },
      {
        config: baseConfig,
        selectFeeds: async () => [FEED],
        fetchFeed,
        persistence,
      }
    );

    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(summary.results[0].status).toBe("ok");
    expect(summary.results[0].itemsSeen).toBe(2);
    expect(summary.results[0].itemsNew).toBe(2); // unique candidates

    // The whole point of a dry run: zero writes.
    expect(persistence.upsertFeedItems).not.toHaveBeenCalled();
    expect(persistence.recordPollState).not.toHaveBeenCalled();
    expect(persistence.insertFetchLog).not.toHaveBeenCalled();
  });
});

describe("runMonitor — live run", () => {
  it("stages items, records ok poll-state, and logs", async () => {
    const fetchFeed = vi.fn(async () => okOutcome());
    const persistence = makePersistence();
    const summary = await runMonitor(
      { dryRun: false },
      {
        config: baseConfig,
        selectFeeds: async () => [FEED],
        fetchFeed,
        persistence,
        now: () => new Date("2026-06-15T00:00:00.000Z"),
      }
    );

    expect(persistence.upsertFeedItems).toHaveBeenCalledTimes(1);
    expect(summary.results[0].itemsNew).toBe(2); // from the upsert mock
    expect(persistence.recordPollState).toHaveBeenCalledWith(
      "feed-1",
      expect.objectContaining({
        lastStatus: "ok",
        failureCount: 0,
        etag: 'W/"v1"',
      })
    );
    expect(persistence.insertFetchLog).toHaveBeenCalledTimes(1);
  });

  it("only exposes the three staging writers (never ozbargain_signals)", () => {
    const persistence = makePersistence();
    expect(Object.keys(persistence).sort()).toEqual([
      "insertFetchLog",
      "recordPollState",
      "upsertFeedItems",
    ]);
  });

  it("requires persistence for a non-dry run", async () => {
    await expect(
      runMonitor(
        { dryRun: false },
        { config: baseConfig, selectFeeds: async () => [FEED] }
      )
    ).rejects.toThrow(/persistence is required/);
  });
});

describe("runMonitor — blocked", () => {
  it("stops the run and auto-disables the feed", async () => {
    const feeds: MonitorFeed[] = [FEED, { ...FEED, id: "feed-2" }];
    const fetchFeed = vi.fn(
      async (): Promise<FetchFeedOutcome> => ({
        kind: "blocked",
        httpStatus: 403,
        reason: "anti-bot challenge",
        retryAfterSeconds: null,
      })
    );
    const persistence = makePersistence();
    const summary = await runMonitor(
      { dryRun: false },
      {
        config: { ...baseConfig, maxFeedsPerRun: 5 },
        selectFeeds: async () => feeds,
        fetchFeed,
        persistence,
      }
    );

    // Blocked → stop immediately, never touch the second feed.
    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0].status).toBe("blocked");
    expect(persistence.recordPollState).toHaveBeenCalledWith(
      "feed-1",
      expect.objectContaining({
        lastStatus: "blocked",
        failureCount: 1,
        isEnabled: false,
      })
    );
    expect(persistence.upsertFeedItems).not.toHaveBeenCalled();
  });
});
