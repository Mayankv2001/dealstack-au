import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  merchantId: string | null;
  isEnabled: boolean;
}

interface FeedSourceRow {
  id: string;
  label: string;
  feed_url: string;
  kind: FeedSourceKind;
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
