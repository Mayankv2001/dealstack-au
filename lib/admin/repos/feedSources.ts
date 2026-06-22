import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  FEED_SOURCE_TYPES,
  isApprovedForFetch,
  isFeedSourceType,
  type FeedSourceType,
} from "@/lib/monitor/offerChanges";
import type { FeedItemInsert } from "@/lib/monitor/mapFeedItem";
import type {
  FeedFetchLogEntry,
  FeedPollStatePatch,
  MonitorFeed,
} from "@/lib/monitor/runMonitor";

/**
 * Admin-side feed sources repository — SERVICE-ROLE ONLY.
 *
 * Manages the `feed_sources` allowlist for the PLANNED OzBargain monitor. Like
 * the other admin repos it talks to Supabase through getSupabaseAdmin() (which
 * bypasses RLS) and must only run on the server behind requireAdmin(); the
 * browser guard inside getSupabaseAdmin() is the backstop.
 *
 * This is registration/config only. There is NO fetcher, cron, or agent — and
 * nothing here makes an external request. Enabling a feed merely flags it as
 * eligible for a future monitor run; the poll-state columns (etag, last_status,
 * failure_count, next_earliest_fetch_at) are written by that future monitor, so
 * the admin UI treats them as read-only.
 */

/** Feed kinds (matches the DB CHECK constraint). */
export const FEED_SOURCE_KINDS = ["front", "store", "category"] as const;
export type FeedSourceKind = (typeof FEED_SOURCE_KINDS)[number];

// Registry source-type tags live with the (pure) monitor logic; re-export them
// here so the source admin form/actions have a single import surface.
export { FEED_SOURCE_TYPES, isFeedSourceType, isApprovedForFetch };
export type { FeedSourceType };

/** Possible last-run summaries (matches the DB CHECK constraint); null = never. */
export type FeedSourceStatus = "ok" | "not-modified" | "error" | "blocked";

// The store dropdown is identical to the cashback admin's, so reuse it.
export { listStoreOptions, type StoreOption } from "@/lib/admin/repos/cashback";

/** A feed source as the admin sees it — editable fields plus read-only state. */
export interface AdminFeedSource {
  id: string;
  label: string;
  feedUrl: string;
  kind: FeedSourceKind;
  /** Registry tag (ozbargain, pointhacks, …). Only verified types are fetched. */
  sourceType: FeedSourceType;
  merchantId: string | null;
  /** Joined store name for display; null when not store-specific. */
  storeName: string | null;
  isEnabled: boolean;
  // ── Monitor-managed, read-only in the admin UI ──
  lastStatus: FeedSourceStatus | null;
  lastFetchedAt: string | null;
  failureCount: number;
  nextEarliestFetchAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface FeedSourceInput {
  label: string;
  feedUrl: string;
  kind: FeedSourceKind;
  sourceType: FeedSourceType;
  merchantId: string | null;
  isEnabled: boolean;
}

interface FeedSourceRow {
  id: string;
  label: string;
  feed_url: string;
  kind: FeedSourceKind;
  source_type: FeedSourceType;
  merchant_id: string | null;
  is_enabled: boolean;
  last_status: FeedSourceStatus | null;
  last_fetched_at: string | null;
  failure_count: number | string | null;
  next_earliest_fetch_at: string | null;
  created_at: string;
  updated_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapFeedSource(r: FeedSourceRow): AdminFeedSource {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
  return {
    id: r.id,
    label: r.label,
    feedUrl: r.feed_url,
    kind: r.kind,
    sourceType: r.source_type,
    merchantId: r.merchant_id,
    storeName: store?.name ?? null,
    isEnabled: r.is_enabled,
    lastStatus: r.last_status,
    lastFetchedAt: r.last_fetched_at,
    failureCount: r.failure_count == null ? 0 : Number(r.failure_count),
    nextEarliestFetchAt: r.next_earliest_fetch_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Snake-case payload for the EDITABLE fields only (poll-state is left alone). */
function toRow(input: FeedSourceInput) {
  return {
    label: input.label,
    feed_url: input.feedUrl,
    kind: input.kind,
    source_type: input.sourceType,
    merchant_id: input.merchantId,
    is_enabled: input.isEnabled,
  };
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every feed source, oldest first. */
export async function listFeedSources(): Promise<AdminFeedSource[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_sources")
    .select(SELECT_WITH_STORE)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listFeedSources failed: ${error.message}`);
  return ((data ?? []) as unknown as FeedSourceRow[]).map(mapFeedSource);
}

/** A single feed source by id, or null when it does not exist. */
export async function getFeedSource(id: string): Promise<AdminFeedSource | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_sources")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getFeedSource failed: ${error.message}`);
  if (!data) return null;
  return mapFeedSource(data as unknown as FeedSourceRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new feed source and returns its generated id. */
export async function insertFeedSource(input: FeedSourceInput): Promise<string> {
  const db = getSupabaseAdmin();
  const id = randomUUID();
  const { error } = await db
    .from("feed_sources")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertFeedSource failed: ${error.message}`);
  return id;
}

/** Updates the editable fields of an existing feed source. */
export async function updateFeedSource(
  id: string,
  input: FeedSourceInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_sources")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateFeedSource failed: ${error.message}`);
}

/** Flips just the enabled flag (enable / disable from the list view). */
export async function setFeedSourceEnabled(
  id: string,
  isEnabled: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_sources")
    .update({ is_enabled: isEnabled })
    .eq("id", id);
  if (error) throw new Error(`setFeedSourceEnabled failed: ${error.message}`);
}

// ── Monitor ingestion (SERVICE-ROLE; used by the manual monitor script) ──────
// These back the runMonitor orchestrator's persistence contract. They write ONLY
// to the staging tables (feed_items, feed_fetch_log) and feed_sources poll-state
// — never to ozbargain_signals. The kill switch is honoured here too: disabled
// feeds are never returned by listDueEnabledFeeds().

interface CandidateRow {
  id: string;
  label: string;
  feed_url: string;
  etag: string | null;
  last_modified: string | null;
  failure_count: number | string | null;
  next_earliest_fetch_at: string | null;
}

/**
 * Enabled feeds that are DUE (next_earliest_fetch_at null or <= now), least
 * recently fetched first, capped at `limit`. Optionally restricted to one id.
 * Disabled feeds are never returned — the kill switch is enforced at the query.
 * Due-ness is filtered in JS to avoid PostgREST `.or()` timestamp escaping.
 */
export async function listDueEnabledFeeds(opts: {
  sourceId?: string;
  now: Date;
  limit: number;
}): Promise<MonitorFeed[]> {
  const db = getSupabaseAdmin();
  let query = db
    .from("feed_sources")
    .select(
      "id, label, feed_url, etag, last_modified, failure_count, next_earliest_fetch_at"
    )
    .eq("is_enabled", true)
    .order("last_fetched_at", { ascending: true, nullsFirst: true });
  if (opts.sourceId) query = query.eq("id", opts.sourceId);

  const { data, error } = await query;
  if (error) throw new Error(`listDueEnabledFeeds failed: ${error.message}`);

  const nowMs = opts.now.getTime();
  const due = ((data ?? []) as unknown as CandidateRow[]).filter((r) => {
    const next = r.next_earliest_fetch_at;
    return next == null || Date.parse(next) <= nowMs;
  });

  return due.slice(0, Math.max(1, opts.limit)).map((r) => ({
    id: r.id,
    label: r.label,
    feedUrl: r.feed_url,
    etag: r.etag,
    lastModified: r.last_modified,
    failureCount: r.failure_count == null ? 0 : Number(r.failure_count),
  }));
}

/**
 * Stage parsed items as `feed_items` (review_state 'new'), ignoring conflicts on
 * source_native_id so re-runs are idempotent and never clobber an admin's triage.
 * Returns the number of NEW rows inserted. Never publishes — promotion to a
 * pending signal stays a separate manual queue action.
 */
export async function upsertFeedItems(
  feedSourceId: string,
  items: FeedItemInsert[]
): Promise<number> {
  if (items.length === 0) return 0;
  const db = getSupabaseAdmin();
  const fetchedAt = new Date().toISOString();
  const rows = items.map((item) => ({
    feed_source_id: feedSourceId,
    source_native_id: item.source_native_id,
    link: item.link,
    raw_title: item.raw_title,
    raw_summary: item.raw_summary,
    categories: item.categories,
    posted_at: item.posted_at,
    content_hash: item.content_hash,
    fetched_at: fetchedAt,
    review_state: "new",
  }));
  const { data, error } = await db
    .from("feed_items")
    .upsert(rows, { onConflict: "source_native_id", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`upsertFeedItems failed: ${error.message}`);
  return data?.length ?? 0;
}

/** Update ONLY the monitor-managed poll-state columns of a feed source. */
export async function recordFeedPollState(
  feedSourceId: string,
  patch: FeedPollStatePatch
): Promise<void> {
  const update: Record<string, unknown> = {};
  if ("etag" in patch) update.etag = patch.etag;
  if ("lastModified" in patch) update.last_modified = patch.lastModified;
  if ("lastFetchedAt" in patch) update.last_fetched_at = patch.lastFetchedAt;
  if ("lastStatus" in patch) update.last_status = patch.lastStatus;
  if ("failureCount" in patch) update.failure_count = patch.failureCount;
  if ("nextEarliestFetchAt" in patch) {
    update.next_earliest_fetch_at = patch.nextEarliestFetchAt;
  }
  if ("isEnabled" in patch) update.is_enabled = patch.isEnabled;
  if (Object.keys(update).length === 0) return;

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_sources")
    .update(update)
    .eq("id", feedSourceId);
  if (error) throw new Error(`recordFeedPollState failed: ${error.message}`);
}

/** Append one per-run audit row to feed_fetch_log. */
export async function insertFeedFetchLog(
  entry: FeedFetchLogEntry
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("feed_fetch_log").insert({
    feed_source_id: entry.feedSourceId,
    started_at: entry.startedAt,
    finished_at: entry.finishedAt,
    http_status: entry.httpStatus,
    items_seen: entry.itemsSeen,
    items_new: entry.itemsNew,
    error: entry.error,
  });
  if (error) throw new Error(`insertFeedFetchLog failed: ${error.message}`);
}
