import { parseFeed } from "./parseFeed";
import { mapFeedItems, type FeedItemInsert } from "./mapFeedItem";
import { fetchFeed as defaultFetchFeed, type FetchFeedOutcome } from "./fetchFeed";
import {
  nextEarliestAfterFailure,
  nextEarliestAfterSuccess,
  shouldAutoDisable,
} from "./backoff";

/**
 * Feed monitor orchestrator — shared by the manual script and daily cron. It
 * selects enabled, due feeds, conditionally GETs each one
 * SEQUENTIALLY (concurrency = 1), parses + maps the XML, and — only when NOT a
 * dry run — stages new `feed_items`, writes a `feed_fetch_log` row, and updates
 * `feed_sources` poll-state. It NEVER writes `ozbargain_signals`; an admin queue
 * approval remains mandatory.
 *
 * Safety invariants enforced here:
 *   - the kill switch (`config.enabled`) short-circuits with ZERO outbound calls;
 *   - a dry run fetches + parses but writes NOTHING (no feed_items, poll-state,
 *     or log);
 *   - at most `config.maxFeedsPerRun` feeds per run;
 *   - a `blocked` outcome stops the whole run and (live) disables the feed.
 *
 * This module has no DB or env imports — the caller injects the feed selector and
 * the persistence functions — so it is fully unit-testable offline with a fake
 * fetch.
 */

/** Last-run summary value (mirrors feed_sources.last_status CHECK). */
export type FeedStatus = "ok" | "not-modified" | "error" | "blocked";

/** The subset of a feed_sources row the orchestrator needs. */
export interface MonitorFeed {
  id: string;
  label: string;
  feedUrl: string;
  sourceType: string;
  etag: string | null;
  lastModified: string | null;
  failureCount: number;
}

export interface MonitorConfig {
  /** Resolved from OZB_MONITOR_ENABLED — false = no fetch at all. */
  enabled: boolean;
  /** Identifying UA (resolved by the caller; required only when enabled). */
  userAgent: string;
  maxFeedsPerRun: number;
  minIntervalHours: number;
}

/** Poll-state patch — only the monitor-managed columns of feed_sources. */
export interface FeedPollStatePatch {
  etag?: string | null;
  lastModified?: string | null;
  lastFetchedAt?: string | null;
  lastStatus?: FeedStatus;
  failureCount?: number;
  nextEarliestFetchAt?: string | null;
  /** Auto-disable kill (blocked, or failure threshold reached). */
  isEnabled?: boolean;
}

/** One append-only feed_fetch_log row. */
export interface FeedFetchLogEntry {
  feedSourceId: string;
  startedAt: string;
  finishedAt: string | null;
  httpStatus: number | null;
  itemsSeen: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsSkipped: number;
  error: string | null;
}

export interface FeedUpsertResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/** Side-effecting writes — supplied only for a non-dry run. */
export interface MonitorPersistence {
  /** Insert new feed_items (ignore conflicts on source_native_id); returns inserted count. */
  upsertFeedItems(
    feedSourceId: string,
    items: FeedItemInsert[]
  ): Promise<FeedUpsertResult>;
  recordPollState(feedSourceId: string, patch: FeedPollStatePatch): Promise<void>;
  insertFetchLog(entry: FeedFetchLogEntry): Promise<void>;
}

export interface MonitorDeps {
  config: MonitorConfig;
  /** Returns enabled + due feeds (disabled feeds must never be returned). */
  selectFeeds(opts: {
    sourceId?: string;
    now: Date;
    limit: number;
  }): Promise<MonitorFeed[]>;
  /** Defaults to the real networked fetchFeed; tests inject a fake. */
  fetchFeed?: (input: {
    feedUrl: string;
    sourceType: string;
    etag?: string | null;
    lastModified?: string | null;
    userAgent: string;
    now?: Date;
  }) => Promise<FetchFeedOutcome>;
  /** Required when not a dry run; ignored for dry runs. */
  persistence?: MonitorPersistence;
  now?: () => Date;
}

export interface RunMonitorOptions {
  dryRun: boolean;
  /** Restrict the run to a single feed_sources id. */
  sourceId?: string;
}

export interface FeedRunResult {
  feedId: string;
  label: string;
  feedUrl: string;
  status: FeedStatus;
  httpStatus: number | null;
  itemsSeen: number;
  /** Live: rows inserted. Dry run: unique candidates that WOULD be staged. */
  itemsNew: number;
  itemsUpdated: number;
  itemsSkipped: number;
  error: string | null;
  /** A few parsed items, for the dry-run report. */
  sampleItems: { sourceNativeId: string; rawTitle: string }[];
}

export interface MonitorRunSummary {
  enabled: boolean;
  dryRun: boolean;
  feedsConsidered: number;
  feedsProcessed: number;
  results: FeedRunResult[];
  note?: string;
}

const SAMPLE_LIMIT = 5;

/** Handle one feed's fetch outcome: build its result and (live) write side effects. */
async function handleFeed(
  feed: MonitorFeed,
  outcome: FetchFeedOutcome,
  ctx: {
    dryRun: boolean;
    now: () => Date;
    config: MonitorConfig;
    persistence?: MonitorPersistence;
    startedAt: string;
  }
): Promise<{ result: FeedRunResult; stop: boolean }> {
  const { dryRun, now, config, persistence, startedAt } = ctx;
  const skeleton = {
    feedId: feed.id,
    label: feed.label,
    feedUrl: feed.feedUrl,
  };

  // Parse up front: a body can pass the fetcher's sniff yet still crash the XML
  // parser (e.g. truncated mid-CDATA / mid-tag). Degrading that to a normal
  // fetch failure keeps the backoff + fetch-log + auto-disable accounting
  // intact instead of aborting the run with nothing recorded for the feed.
  let prepared: { itemsSeen: number; mapped: FeedItemInsert[] } | null = null;
  if (outcome.kind === "ok") {
    try {
      const parsed = parseFeed(outcome.body);
      prepared = { itemsSeen: parsed.length, mapped: mapFeedItems(parsed) };
    } catch (err) {
      outcome = {
        kind: "error",
        httpStatus: outcome.httpStatus,
        reason: `feed XML parse failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
        retryAfterSeconds: null,
      };
    }
  }

  if (outcome.kind === "not-modified") {
    if (!dryRun && persistence) {
      const ts = now();
      await persistence.recordPollState(feed.id, {
        etag: outcome.etag ?? feed.etag,
        lastModified: outcome.lastModified ?? feed.lastModified,
        lastFetchedAt: ts.toISOString(),
        lastStatus: "not-modified",
        failureCount: 0,
        nextEarliestFetchAt: nextEarliestAfterSuccess(ts, config.minIntervalHours),
      });
      await persistence.insertFetchLog({
        feedSourceId: feed.id,
        startedAt,
        finishedAt: ts.toISOString(),
        httpStatus: outcome.httpStatus,
        itemsSeen: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: null,
      });
    }
    return {
      result: {
        ...skeleton,
        status: "not-modified",
        httpStatus: outcome.httpStatus,
        itemsSeen: 0,
        itemsNew: 0,
        itemsUpdated: 0,
        itemsSkipped: 0,
        error: null,
        sampleItems: [],
      },
      stop: false,
    };
  }

  if (outcome.kind === "ok" && prepared) {
    const { itemsSeen, mapped } = prepared;
    const sampleItems = mapped.slice(0, SAMPLE_LIMIT).map((m) => ({
      sourceNativeId: m.source_native_id,
      rawTitle: m.raw_title,
    }));
    // Dry run reports unique candidates; a live run reports rows actually inserted.
    let itemsNew = mapped.length;
    let itemsUpdated = 0;
    let itemsSkipped = Math.max(0, itemsSeen - mapped.length);
    if (!dryRun && persistence) {
      const ts = now();
      const upsert = await persistence.upsertFeedItems(feed.id, mapped);
      itemsNew = upsert.inserted;
      itemsUpdated = upsert.updated;
      itemsSkipped += upsert.skipped;
      await persistence.recordPollState(feed.id, {
        etag: outcome.etag,
        lastModified: outcome.lastModified,
        lastFetchedAt: ts.toISOString(),
        lastStatus: "ok",
        failureCount: 0,
        nextEarliestFetchAt: nextEarliestAfterSuccess(ts, config.minIntervalHours),
      });
      await persistence.insertFetchLog({
        feedSourceId: feed.id,
        startedAt,
        finishedAt: ts.toISOString(),
        httpStatus: outcome.httpStatus,
        itemsSeen,
        itemsNew,
        itemsUpdated,
        itemsSkipped,
        error: null,
      });
    }
    return {
      result: {
        ...skeleton,
        status: "ok",
        httpStatus: outcome.httpStatus,
        itemsSeen,
        itemsNew,
        itemsUpdated,
        itemsSkipped,
        error: null,
        sampleItems,
      },
      stop: false,
    };
  }

  // error | blocked — back off, log, and (live) auto-disable on block/threshold.
  // An ok outcome either returned above or was rewritten to an error by the
  // parse guard; this narrows the union for the failure handling below.
  if (outcome.kind === "ok") {
    throw new Error("handleFeed: unhandled ok outcome");
  }
  const blocked = outcome.kind === "blocked";
  const status: FeedStatus = blocked ? "blocked" : "error";
  const failureCount = feed.failureCount + 1;
  if (!dryRun && persistence) {
    const ts = now();
    const disable = blocked || shouldAutoDisable(failureCount);
    await persistence.recordPollState(feed.id, {
      lastFetchedAt: ts.toISOString(),
      lastStatus: status,
      failureCount,
      nextEarliestFetchAt: nextEarliestAfterFailure(
        ts,
        failureCount,
        outcome.retryAfterSeconds
      ),
      ...(disable ? { isEnabled: false } : {}),
    });
    await persistence.insertFetchLog({
      feedSourceId: feed.id,
      startedAt,
      finishedAt: ts.toISOString(),
      httpStatus: outcome.httpStatus,
      itemsSeen: 0,
      itemsNew: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      error: outcome.reason,
    });
  }
  return {
    result: {
      ...skeleton,
      status,
      httpStatus: outcome.httpStatus,
      itemsSeen: 0,
      itemsNew: 0,
      itemsUpdated: 0,
      itemsSkipped: 0,
      error: outcome.reason,
      sampleItems: [],
    },
    // A block means stop the whole run — never keep hammering a blocking host.
    stop: blocked,
  };
}

export async function runMonitor(
  options: RunMonitorOptions,
  deps: MonitorDeps
): Promise<MonitorRunSummary> {
  const { dryRun } = options;
  const { config } = deps;
  const now = deps.now ?? (() => new Date());
  const doFetch = deps.fetchFeed ?? defaultFetchFeed;

  // Kill switch: master OFF beats everything — zero outbound requests.
  if (!config.enabled) {
    return {
      enabled: false,
      dryRun,
      feedsConsidered: 0,
      feedsProcessed: 0,
      results: [],
      note: "OZB_MONITOR_ENABLED is not 'true' — kill switch is off, no fetch performed.",
    };
  }

  if (!dryRun && !deps.persistence) {
    throw new Error("runMonitor: persistence is required for a non-dry run.");
  }

  const limit = Math.max(1, config.maxFeedsPerRun);
  const feeds = await deps.selectFeeds({
    sourceId: options.sourceId,
    now: now(),
    limit,
  });

  const results: FeedRunResult[] = [];
  let processed = 0;

  // Concurrency = 1: strictly sequential, capped at the per-run feed limit.
  for (const feed of feeds) {
    if (processed >= limit) break;
    const startedAt = now().toISOString();
    const outcome = await doFetch({
      feedUrl: feed.feedUrl,
      sourceType: feed.sourceType,
      etag: feed.etag,
      lastModified: feed.lastModified,
      userAgent: config.userAgent,
      now: now(),
    });
    processed += 1;

    const { result, stop } = await handleFeed(feed, outcome, {
      dryRun,
      now,
      config,
      persistence: deps.persistence,
      startedAt,
    });
    results.push(result);
    if (stop) break;
  }

  return {
    enabled: true,
    dryRun,
    feedsConsidered: feeds.length,
    feedsProcessed: processed,
    results,
  };
}
