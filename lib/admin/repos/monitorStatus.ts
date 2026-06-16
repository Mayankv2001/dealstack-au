import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { countNewFeedItems } from "@/lib/admin/repos/feedQueue";

/**
 * Monitor health/status — SERVICE-ROLE ONLY, READ-ONLY.
 *
 * Aggregates a read-only snapshot of the PLANNED OzBargain monitor: the env
 * master switch, whether compliance is approved, feed-source counts, the review
 * queue backlog, recent fetch-log rows, and any error/blocked feeds. It performs
 * NO fetching, writes nothing, and makes no external request — it only reads our
 * own Supabase project via getSupabaseAdmin() (which bypasses RLS) and must only
 * run on the server behind requireAdmin().
 *
 * There is still no fetcher or cron, so the fetch log is expected to be empty.
 */

/** One row of the recent fetch-log feed. */
export interface MonitorFetchLogEntry {
  id: string;
  feedSourceLabel: string | null;
  startedAt: string;
  finishedAt: string | null;
  httpStatus: number | null;
  itemsSeen: number;
  itemsNew: number;
  error: string | null;
}

/** A feed source whose last run errored or was blocked. */
export interface MonitorProblemSource {
  id: string;
  label: string;
  lastStatus: string | null;
  failureCount: number;
  isEnabled: boolean;
}

/** A staged feed item, summarised for the monitor's "latest items" preview. */
export interface MonitorFeedItemSummary {
  id: string;
  feedSourceLabel: string | null;
  sourceNativeId: string;
  rawTitle: string;
  reviewState: string;
  /** Full content hash (the UI shows a short prefix); null on older rows. */
  contentHash: string | null;
  fetchedAt: string;
}

/** Counts of staged feed_items by triage state. */
export interface FeedItemStateCounts {
  new: number;
  imported: number;
  ignored: number;
  duplicate: number;
}

export interface MonitorStatus {
  /** Raw OZB_MONITOR_ENABLED value (null when the var is absent). */
  envEnabledRaw: string | null;
  /** Interpreted master switch — true only when the value is exactly "true". */
  envEnabled: boolean;
  /** True when a compliance_reviews row has approved_for_monitoring = true. */
  complianceApproved: boolean;
  feedSourcesTotal: number;
  feedSourcesEnabled: number;
  feedQueuePending: number;
  /** Total staged feed_items across all triage states. */
  feedItemsTotal: number;
  /** Staged feed_items broken down by triage state. */
  feedItemCounts: FeedItemStateCounts;
  recentFetchLog: MonitorFetchLogEntry[];
  /** Most recent run that completed without an error (ok / not-modified). */
  lastSuccessLog: MonitorFetchLogEntry | null;
  /** Most recent run that recorded an error (blocked / error). */
  lastProblemLog: MonitorFetchLogEntry | null;
  /** Newest staged feed items (any state), most recently fetched first. */
  latestFeedItems: MonitorFeedItemSummary[];
  problemSources: MonitorProblemSource[];
  /** Enabled feeds while compliance is NOT approved — a risk to surface. */
  enabledWithoutApproval: number;
}

type AdminDb = ReturnType<typeof getSupabaseAdmin>;

async function countRows(
  db: AdminDb,
  table: string,
  filter?: { column: string; value: string | boolean }
): Promise<number> {
  let query = db.from(table).select("*", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  if (error) throw new Error(`count ${table} failed: ${error.message}`);
  return count ?? 0;
}

interface FetchLogRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  http_status: number | null;
  items_seen: number | string | null;
  items_new: number | string | null;
  error: string | null;
  source: { label: string } | { label: string }[] | null;
}

function mapFetchLog(r: FetchLogRow): MonitorFetchLogEntry {
  const source = Array.isArray(r.source) ? r.source[0] : r.source;
  return {
    id: r.id,
    feedSourceLabel: source?.label ?? null,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    httpStatus: r.http_status,
    itemsSeen: r.items_seen == null ? 0 : Number(r.items_seen),
    itemsNew: r.items_new == null ? 0 : Number(r.items_new),
    error: r.error,
  };
}

interface ProblemSourceRow {
  id: string;
  label: string;
  last_status: string | null;
  failure_count: number | string | null;
  is_enabled: boolean;
}

interface FeedItemSummaryRow {
  id: string;
  source_native_id: string;
  raw_title: string;
  review_state: string;
  content_hash: string | null;
  fetched_at: string;
  source: { label: string } | { label: string }[] | null;
}

function mapFeedItemSummary(r: FeedItemSummaryRow): MonitorFeedItemSummary {
  const source = Array.isArray(r.source) ? r.source[0] : r.source;
  return {
    id: r.id,
    feedSourceLabel: source?.label ?? null,
    sourceNativeId: r.source_native_id,
    rawTitle: r.raw_title,
    reviewState: r.review_state,
    contentHash: r.content_hash,
    fetchedAt: r.fetched_at,
  };
}

/** Read-only aggregate snapshot of the (planned) monitor's safety/health. */
export async function getMonitorStatus(): Promise<MonitorStatus> {
  const db = getSupabaseAdmin();

  const envEnabledRaw = process.env.OZB_MONITOR_ENABLED ?? null;
  const envEnabled = envEnabledRaw === "true";

  const [
    approvedCount,
    feedSourcesTotal,
    feedSourcesEnabled,
    feedQueuePending,
    feedItemsTotal,
    importedCount,
    ignoredCount,
    duplicateCount,
    fetchLogData,
    lastSuccessData,
    lastProblemData,
    latestItemsData,
    problemData,
  ] = await Promise.all([
    countRows(db, "compliance_reviews", {
      column: "approved_for_monitoring",
      value: true,
    }),
    countRows(db, "feed_sources"),
    countRows(db, "feed_sources", { column: "is_enabled", value: true }),
    countNewFeedItems(),
    countRows(db, "feed_items"),
    countRows(db, "feed_items", { column: "review_state", value: "imported" }),
    countRows(db, "feed_items", { column: "review_state", value: "ignored" }),
    countRows(db, "feed_items", { column: "review_state", value: "duplicate" }),
    db
      .from("feed_fetch_log")
      .select("*, source:feed_sources(label)")
      .order("started_at", { ascending: false })
      .limit(5),
    // Last run that completed cleanly (ok / not-modified store no error).
    db
      .from("feed_fetch_log")
      .select("*, source:feed_sources(label)")
      .is("error", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Last run that recorded an error (blocked / error).
    db
      .from("feed_fetch_log")
      .select("*, source:feed_sources(label)")
      .not("error", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("feed_items")
      .select(
        "id, source_native_id, raw_title, review_state, content_hash, fetched_at, source:feed_sources(label)"
      )
      .order("fetched_at", { ascending: false })
      .limit(5),
    db
      .from("feed_sources")
      .select("id, label, last_status, failure_count, is_enabled")
      .in("last_status", ["error", "blocked"]),
  ]);

  if (fetchLogData.error) {
    throw new Error(`recent fetch log failed: ${fetchLogData.error.message}`);
  }
  if (lastSuccessData.error) {
    throw new Error(`last success log failed: ${lastSuccessData.error.message}`);
  }
  if (lastProblemData.error) {
    throw new Error(`last problem log failed: ${lastProblemData.error.message}`);
  }
  if (latestItemsData.error) {
    throw new Error(`latest feed items failed: ${latestItemsData.error.message}`);
  }
  if (problemData.error) {
    throw new Error(`problem sources failed: ${problemData.error.message}`);
  }

  const recentFetchLog = (
    (fetchLogData.data ?? []) as unknown as FetchLogRow[]
  ).map(mapFetchLog);

  const lastSuccessLog = lastSuccessData.data
    ? mapFetchLog(lastSuccessData.data as unknown as FetchLogRow)
    : null;
  const lastProblemLog = lastProblemData.data
    ? mapFetchLog(lastProblemData.data as unknown as FetchLogRow)
    : null;

  const latestFeedItems = (
    (latestItemsData.data ?? []) as unknown as FeedItemSummaryRow[]
  ).map(mapFeedItemSummary);

  const problemSources = (
    (problemData.data ?? []) as unknown as ProblemSourceRow[]
  ).map((r) => ({
    id: r.id,
    label: r.label,
    lastStatus: r.last_status,
    failureCount: r.failure_count == null ? 0 : Number(r.failure_count),
    isEnabled: r.is_enabled,
  }));

  const complianceApproved = approvedCount > 0;

  return {
    envEnabledRaw,
    envEnabled,
    complianceApproved,
    feedSourcesTotal,
    feedSourcesEnabled,
    feedQueuePending,
    feedItemsTotal,
    feedItemCounts: {
      new: feedQueuePending,
      imported: importedCount,
      ignored: ignoredCount,
      duplicate: duplicateCount,
    },
    recentFetchLog,
    lastSuccessLog,
    lastProblemLog,
    latestFeedItems,
    problemSources,
    enabledWithoutApproval: complianceApproved ? 0 : feedSourcesEnabled,
  };
}
