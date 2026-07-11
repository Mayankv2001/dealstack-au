import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import {
  APPROVED_FEED_SOURCE_TYPES,
  FEED_SOURCE_TYPES,
  isApprovedForFetch,
  isFeedSourceType,
  type FeedSourceType,
} from "@/lib/monitor/offerChanges";
import type { FeedItemInsert } from "@/lib/monitor/mapFeedItem";
import { feedItemReviewState } from "@/lib/monitor/feedItemPreference";
import { classifyFeedChanges } from "@/lib/monitor/classifyFeedChanges";
import { isApprovedFeedUrl } from "@/lib/security/urlPolicy";
import type {
  FeedFetchLogEntry,
  FeedUpsertResult,
  FeedPollStatePatch,
  MonitorFeed,
} from "@/lib/monitor/runMonitor";

/**
 * Admin-side feed sources repository — SERVICE-ROLE ONLY.
 *
 * Manages the `feed_sources` allowlist for the OzBargain monitor. Like
 * the other admin repos it talks to Supabase through getSupabaseAdmin() (which
 * bypasses RLS) and must only run on the server behind requireAdmin(); the
 * browser guard inside getSupabaseAdmin() is the backstop.
 *
 * This is registration/config only. There is NO fetcher, cron, or agent — and
 * nothing here makes an external request. Enabling a feed merely flags it as
 * eligible for a monitor run; the poll-state columns (etag, last_status,
 * failure_count, next_earliest_fetch_at) are written by the monitor, so
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

/** Disable every currently enabled feed source and return the affected count. */
export async function disableAllFeedSources(): Promise<number> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_sources")
    .update({ is_enabled: false })
    .eq("is_enabled", true)
    .select("id");
  if (error) throw new Error(`disableAllFeedSources failed: ${error.message}`);
  return data?.length ?? 0;
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
  source_type: string;
  etag: string | null;
  last_modified: string | null;
  failure_count: number | string | null;
  next_earliest_fetch_at: string | null;
}

/**
 * Enabled feeds of an APPROVED source type that are DUE (next_earliest_fetch_at
 * null or <= now), least recently fetched first, capped at `limit`. Optionally
 * restricted to one id. Disabled feeds are never returned — the kill switch is
 * enforced at the query — and the safe-source gate is enforced here too: only
 * APPROVED_FEED_SOURCE_TYPES (verified RSS/Atom support, currently 'ozbargain')
 * are ever fetched. Registry-only types (pointhacks, freepoints, gcdb,
 * provider-feed, manual-url) are skipped even when enabled — see
 * isApprovedForFetch in lib/monitor/offerChanges.ts and its tests.
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
      "id, label, feed_url, source_type, etag, last_modified, failure_count, next_earliest_fetch_at"
    )
    .eq("is_enabled", true)
    // Safe-source gate at the query…
    .in("source_type", [...APPROVED_FEED_SOURCE_TYPES])
    .order("last_fetched_at", { ascending: true, nullsFirst: true });
  if (opts.sourceId) query = query.eq("id", opts.sourceId);

  const { data, error } = await query;
  if (error) throw new Error(`listDueEnabledFeeds failed: ${error.message}`);

  const nowMs = opts.now.getTime();
  const due = ((data ?? []) as unknown as CandidateRow[]).filter((r) => {
    // …and re-checked in JS (belt and braces, matches the tested pure gate).
    if (!isApprovedForFetch(r.source_type)) return false;
    const next = r.next_earliest_fetch_at;
    return next == null || Date.parse(next) <= nowMs;
  });

  const unsafe = due.find(
    (row) => !isApprovedFeedUrl(row.source_type, row.feed_url)
  );
  if (unsafe) {
    throw new Error(
      `Feed source ${unsafe.id} has a URL that is not approved for its source type.`
    );
  }

  return due.slice(0, Math.max(1, opts.limit)).map((r) => ({
    id: r.id,
    label: r.label,
    feedUrl: r.feed_url,
    sourceType: r.source_type,
    etag: r.etag,
    lastModified: r.last_modified,
    failureCount: r.failure_count == null ? 0 : Number(r.failure_count),
  }));
}

/**
 * Stage parsed items as `feed_items`. Native id, canonical link and content hash
 * dedupe repeat deals; changed source content refreshes the private ledger while
 * preserving prior moderation. Fetching never publishes.
 *
 * Each new row's INITIAL review_state is chosen by the offline category
 * classifier (lib/monitor/feedItemPreference): preferred / uncertain items are
 * staged 'new' (await review); clearly non-preferred categories (alcohol, anime,
 * gaming pre-orders, snacks, …) are staged 'ignored' — still SAVED for audit,
 * just hidden from the review queue. Because the upsert ignores conflicts, this
 * only affects newly-inserted rows; existing items keep their review_state.
 */
export async function upsertFeedItems(
  feedSourceId: string,
  items: FeedItemInsert[]
): Promise<FeedUpsertResult> {
  if (items.length === 0) return { inserted: 0, updated: 0, skipped: 0 };
  const db = getSupabaseAdmin();
  const existing: {
    sourceNativeId: string;
    contentHash: string | null;
    reviewState: string;
    link: string;
  }[] = [];
  const nativeIds = [...new Set(items.map((item) => item.source_native_id))];
  for (let index = 0; index < nativeIds.length; index += 100) {
    const { data, error } = await db
      .from("feed_items")
      .select("source_native_id, content_hash, review_state, link")
      .in("source_native_id", nativeIds.slice(index, index + 100));
    if (error) throw new Error(`upsertFeedItems lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      existing.push({
        sourceNativeId: row.source_native_id,
        contentHash: row.content_hash,
        reviewState: row.review_state,
        link: row.link,
      });
    }
  }
  const hashes = [...new Set(items.map((item) => item.content_hash))];
  const links = [...new Set(items.map((item) => item.link).filter(Boolean))];
  for (const [column, values] of [
    ["content_hash", hashes],
    ["link", links],
  ] as const) {
    for (let index = 0; index < values.length; index += 100) {
      const { data, error } = await db
        .from("feed_items")
        .select("source_native_id, content_hash, review_state, link")
        .in(column, values.slice(index, index + 100));
      if (error) throw new Error(`upsertFeedItems ${column} lookup failed: ${error.message}`);
      for (const row of data ?? []) {
        if (existing.some((item) => item.sourceNativeId === row.source_native_id)) continue;
        existing.push({
          sourceNativeId: row.source_native_id,
          contentHash: row.content_hash,
          reviewState: row.review_state,
          link: row.link,
        });
      }
    }
  }

  const fetchedAt = new Date().toISOString();
  const { changes, inserted, updated, skipped } = classifyFeedChanges(
    items,
    existing
  );
  const rows = changes.map(({ item, previousReviewState }) => ({
      feed_source_id: feedSourceId,
      source_native_id: item.source_native_id,
      link: item.link,
      raw_title: item.raw_title,
      raw_summary: item.raw_summary,
      categories: item.categories,
      posted_at: item.posted_at,
      content_hash: item.content_hash,
      thumbnail_url: item.thumbnail_url,
      declared_expires_at: item.declared_expires_at,
      source_marked_expired: item.source_marked_expired,
      fetched_at: fetchedAt,
      // Existing moderation is immutable across source edits. Only new items
      // receive the category classifier's initial state.
      review_state: previousReviewState ?? feedItemReviewState(item),
    }));
  if (rows.length === 0) return { inserted, updated, skipped };
  const { data, error } = await db
    .from("feed_items")
    .upsert(rows, { onConflict: "source_native_id", ignoreDuplicates: false })
    .select("id");
  if (error) throw new Error(`upsertFeedItems failed: ${error.message}`);
  if ((data?.length ?? 0) !== rows.length) {
    throw new Error("upsertFeedItems did not persist every changed candidate.");
  }
  return { inserted, updated, skipped };
}

/** Update ONLY the monitor-managed poll-state columns of a feed source. */
export async function recordFeedPollState(
  feedSourceId: string,
  patch: FeedPollStatePatch
): Promise<void> {
  const update: TablesUpdate<"feed_sources"> = {};
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
  if (patch.isEnabled === false) {
    const { error: auditError } = await db.from("audit_log").insert({
      actor_email: "system@dealstack.local",
      action: "auto-disable-feed",
      table_name: "feed_sources",
      row_id: feedSourceId,
      diff: {
        lastStatus: patch.lastStatus ?? null,
        failureCount: patch.failureCount ?? null,
      },
    });
    if (auditError) {
      console.warn(`[feed-monitor] auto-disable audit failed: ${auditError.message}`);
    }
  }
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
    items_updated: entry.itemsUpdated,
    items_skipped: entry.itemsSkipped,
    error: entry.error,
  });
  if (error) throw new Error(`insertFeedFetchLog failed: ${error.message}`);
}
