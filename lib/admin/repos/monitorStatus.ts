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
  recentFetchLog: MonitorFetchLogEntry[];
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
    fetchLogData,
    problemData,
  ] = await Promise.all([
    countRows(db, "compliance_reviews", {
      column: "approved_for_monitoring",
      value: true,
    }),
    countRows(db, "feed_sources"),
    countRows(db, "feed_sources", { column: "is_enabled", value: true }),
    countNewFeedItems(),
    db
      .from("feed_fetch_log")
      .select("*, source:feed_sources(label)")
      .order("started_at", { ascending: false })
      .limit(5),
    db
      .from("feed_sources")
      .select("id, label, last_status, failure_count, is_enabled")
      .in("last_status", ["error", "blocked"]),
  ]);

  if (fetchLogData.error) {
    throw new Error(`recent fetch log failed: ${fetchLogData.error.message}`);
  }
  if (problemData.error) {
    throw new Error(`problem sources failed: ${problemData.error.message}`);
  }

  const recentFetchLog = (
    (fetchLogData.data ?? []) as unknown as FetchLogRow[]
  ).map(mapFetchLog);

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
    recentFetchLog,
    problemSources,
    enabledWithoutApproval: complianceApproved ? 0 : feedSourcesEnabled,
  };
}
