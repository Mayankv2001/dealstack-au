import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PublicTable } from "@/lib/supabase/server";
import { cronSecret } from "@/lib/env";
import { countNewFeedItems } from "@/lib/admin/repos/feedQueue";
import { isApprovedForFetch } from "@/lib/monitor/offerChanges";
import { summarizeFetchHealth } from "@/lib/monitor/health";

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
 * Fetching happens only via the manual monitor:feeds script or the secret-gated
 * Vercel Cron route, and only when enabled — so the fetch log is empty until then.
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
  itemsUpdated: number;
  itemsSkipped: number;
  error: string | null;
}

export interface DailyPipelineRunEntry {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  expiredArchived: number;
  invalidArchived: number;
  staleArchived: number;
  cardOffersArchived: number;
  feedItemsRetired: number;
  feedItemsPurged: number;
  detectionScanned: number;
  detectionDetected: number;
  detectionInserted: number;
  validationChecked: number;
  validationUnknown: number;
  feedsProcessed: number;
  itemsFetched: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: string[];
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
  rejected: number;
}

export interface MonitorStatus {
  /** Raw OZB_MONITOR_ENABLED value (null when the var is absent). */
  envEnabledRaw: string | null;
  /** Interpreted master switch — true only when the value is exactly "true". */
  envEnabled: boolean;
  /** True when CRON_SECRET is set — the cron route returns 503 without it. */
  cronSecretConfigured: boolean;
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
  recentPipelineRuns: DailyPipelineRunEntry[];
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

export interface MonitorHealthSnapshot {
  envEnabled: boolean;
  complianceApproved: boolean;
  fetchableEnabledFeedCount: number;
  lastSuccessAt: string | null;
  pipelineExpected: boolean;
  latestPipelineAt: string | null;
  latestPipelineStatus: string | null;
  runningPipelineStartedAt: string | null;
  consecutiveParserFailures: number;
  autoDisabledFeedCount: number;
  fetchAnomaly: "zero-collapse" | "spike" | null;
  duplicateRunCount: number;
}

/** Minimal read-only snapshot for the externally polled health route. */
export async function getMonitorHealthSnapshot(): Promise<MonitorHealthSnapshot> {
  const envEnabled = process.env.OZB_MONITOR_ENABLED === "true";
  const db = getSupabaseAdmin();
  const [approval, sources, lastSuccess, latestPipeline, runningPipeline, logs, runs] =
    await Promise.all([
    db
      .from("compliance_reviews")
      .select("id", { count: "exact", head: true })
      .eq("approved_for_monitoring", true),
    db.from("feed_sources").select("source_type, is_enabled, last_status"),
    db
      .from("feed_fetch_log")
      .select("started_at")
      .is("error", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("daily_pipeline_runs")
      .select("started_at, status")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("daily_pipeline_runs")
      .select("started_at")
      .eq("status", "running")
      .order("started_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db
      .from("feed_fetch_log")
      .select("feed_source_id, error, items_seen")
      .order("started_at", { ascending: false })
      .limit(50),
    db
      .from("daily_pipeline_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);
  if (approval.error) throw new Error(`health compliance read failed: ${approval.error.message}`);
  if (sources.error) throw new Error(`health sources read failed: ${sources.error.message}`);
  if (lastSuccess.error) throw new Error(`health success read failed: ${lastSuccess.error.message}`);
  if (latestPipeline.error) throw new Error(`health pipeline read failed: ${latestPipeline.error.message}`);
  if (runningPipeline.error) throw new Error(`health running read failed: ${runningPipeline.error.message}`);
  if (logs.error) throw new Error(`health fetch logs failed: ${logs.error.message}`);
  if (runs.error) throw new Error(`health run history failed: ${runs.error.message}`);

  const sourceRows = (sources.data ?? []) as unknown as {
    source_type: string;
    is_enabled: boolean;
    last_status: string | null;
  }[];
  const success = lastSuccess.data as unknown as { started_at: string } | null;
  const pipeline = latestPipeline.data as unknown as {
    started_at: string;
    status: string;
  } | null;
  const running = runningPipeline.data as unknown as { started_at: string } | null;
  const fetchRows = (logs.data ?? []) as unknown as {
    feed_source_id: string;
    error: string | null;
    items_seen: number | null;
  }[];
  const { consecutiveParserFailures, fetchAnomaly } = summarizeFetchHealth(
    fetchRows.map((row) => ({
      feedSourceId: row.feed_source_id,
      error: row.error,
      itemsSeen: row.items_seen,
    }))
  );
  const runStarts = ((runs.data ?? []) as unknown as { started_at: string }[])
    .map((row) => Date.parse(row.started_at))
    .filter(Number.isFinite);
  let duplicateRunCount = 0;
  for (let index = 1; index < runStarts.length; index++) {
    if (runStarts[index - 1] - runStarts[index] < 5 * 60 * 1000) {
      duplicateRunCount++;
    }
  }
  return {
    envEnabled,
    complianceApproved: (approval.count ?? 0) > 0,
    fetchableEnabledFeedCount: sourceRows.filter(
      (row) => row.is_enabled && isApprovedForFetch(row.source_type)
    ).length,
    lastSuccessAt: success?.started_at ?? null,
    pipelineExpected: true,
    latestPipelineAt: pipeline?.started_at ?? null,
    latestPipelineStatus: pipeline?.status ?? null,
    runningPipelineStartedAt: running?.started_at ?? null,
    consecutiveParserFailures,
    autoDisabledFeedCount: sourceRows.filter(
      (row) =>
        !row.is_enabled &&
        (row.last_status === "blocked" || row.last_status === "error")
    ).length,
    fetchAnomaly,
    duplicateRunCount,
  };
}

async function countRows(
  db: AdminDb,
  table: PublicTable,
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
  items_updated: number | string | null;
  items_skipped: number | string | null;
  error: string | null;
  source: { label: string } | { label: string }[] | null;
}

interface PipelineRunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  expired_archived: number;
  invalid_archived: number;
  stale_archived: number;
  card_offers_archived: number;
  feed_items_retired: number;
  feed_items_purged: number;
  detection_scanned: number;
  detection_detected: number;
  detection_inserted: number;
  validation_checked: number;
  validation_unknown: number;
  feeds_processed: number;
  items_fetched: number;
  items_new: number;
  items_updated: number;
  items_skipped: number;
  errors: unknown;
}

function mapPipelineRun(row: PipelineRunRow): DailyPipelineRunEntry {
  return {
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    expiredArchived: row.expired_archived,
    invalidArchived: row.invalid_archived,
    staleArchived: row.stale_archived,
    cardOffersArchived: row.card_offers_archived,
    feedItemsRetired: row.feed_items_retired,
    feedItemsPurged: row.feed_items_purged,
    detectionScanned: row.detection_scanned,
    detectionDetected: row.detection_detected,
    detectionInserted: row.detection_inserted,
    validationChecked: row.validation_checked,
    validationUnknown: row.validation_unknown,
    feedsProcessed: row.feeds_processed,
    itemsFetched: row.items_fetched,
    itemsNew: row.items_new,
    itemsUpdated: row.items_updated,
    itemsSkipped: row.items_skipped,
    errors: Array.isArray(row.errors)
      ? row.errors.filter((item): item is string => typeof item === "string")
      : [],
  };
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
    itemsUpdated: r.items_updated == null ? 0 : Number(r.items_updated),
    itemsSkipped: r.items_skipped == null ? 0 : Number(r.items_skipped),
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
    rejectedCount,
    pipelineRunData,
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
    countRows(db, "feed_items", { column: "review_state", value: "rejected" }),
    db
      .from("daily_pipeline_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(5),
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
  if (pipelineRunData.error) {
    throw new Error(`recent pipeline runs failed: ${pipelineRunData.error.message}`);
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
  const recentPipelineRuns = (
    (pipelineRunData.data ?? []) as unknown as PipelineRunRow[]
  ).map(mapPipelineRun);

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
    cronSecretConfigured: cronSecret() != null,
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
      rejected: rejectedCount,
    },
    recentFetchLog,
    recentPipelineRuns,
    lastSuccessLog,
    lastProblemLog,
    latestFeedItems,
    problemSources,
    enabledWithoutApproval: complianceApproved ? 0 : feedSourcesEnabled,
  };
}
