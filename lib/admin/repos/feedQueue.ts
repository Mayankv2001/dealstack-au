import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findMerchantIdInText } from "@/lib/sources/normalise";
import type { DealKind } from "@/lib/sources/types";

/**
 * Feed import queue repository — SERVICE-ROLE ONLY.
 *
 * Reads the staged `feed_items` (RLS service-role only) and promotes them into
 * PENDING `ozbargain_signals` for manual moderation. Like the other admin repos
 * this must only run on the server behind requireAdmin(); the browser guard
 * inside getSupabaseAdmin() is the backstop.
 *
 * There is NO OzBargain fetching / scraping / agent here — it only reads/writes
 * our own Supabase project. Nothing here publishes: imports always land as
 * `status = 'pending'`, so they stay invisible to the public site until a human
 * approves them through the existing signals CRUD.
 */

export type FeedReviewState = "new" | "imported" | "ignored" | "duplicate";

/** An existing signal that already carries this item's source_native_id. */
export interface ExistingSignalRef {
  id: string;
  status: string;
}

/** A staged feed item as the review queue sees it. */
export interface FeedQueueItem {
  id: string;
  feedSourceId: string;
  feedSourceLabel: string | null;
  sourceNativeId: string;
  link: string;
  rawTitle: string;
  rawSummary: string;
  categories: string[];
  /** Hash of the meaningful fields — the UI shows a short prefix. */
  contentHash: string | null;
  postedAt: string | null;
  fetchedAt: string;
  reviewState: FeedReviewState;
  promotedSignalId: string | null;
  /**
   * Admin-set homepage-visibility flag. When true the item is excluded from the
   * public homepage Top 5 ONLY — it stays in this queue and remains importable.
   * Orthogonal to reviewState (see migration 005).
   */
  hiddenFromHomepage: boolean;
  /**
   * A signal that already exists with this source_native_id, if any. When set,
   * importing will LINK to it rather than create a new one (idempotent) — so the
   * admin can treat the item as a likely duplicate / already imported.
   */
  existingSignal: ExistingSignalRef | null;
}

/** Result of an import: which signal it maps to, and whether it was just made. */
export interface ImportResult {
  signalId: string;
  /** false = an existing signal with the same source_native_id was reused. */
  created: boolean;
}

type AdminDb = ReturnType<typeof getSupabaseAdmin>;

interface FeedItemRow {
  id: string;
  feed_source_id: string;
  source_native_id: string;
  link: string;
  raw_title: string;
  raw_summary: string;
  categories: string[] | null;
  content_hash: string | null;
  posted_at: string | null;
  fetched_at: string;
  review_state: FeedReviewState;
  promoted_signal_id: string | null;
  hidden_from_homepage: boolean;
  // Embedded one-to-one feed source (PostgREST returns an object; type defensively).
  source: { label: string } | { label: string }[] | null;
}

function mapItem(
  r: FeedItemRow,
  existingSignal: ExistingSignalRef | null = null
): FeedQueueItem {
  const src = Array.isArray(r.source) ? r.source[0] : r.source;
  return {
    id: r.id,
    feedSourceId: r.feed_source_id,
    feedSourceLabel: src?.label ?? null,
    sourceNativeId: r.source_native_id,
    link: r.link,
    rawTitle: r.raw_title,
    rawSummary: r.raw_summary,
    categories: r.categories ?? [],
    contentHash: r.content_hash,
    postedAt: r.posted_at,
    fetchedAt: r.fetched_at,
    reviewState: r.review_state,
    promotedSignalId: r.promoted_signal_id,
    hiddenFromHomepage: r.hidden_from_homepage ?? false,
    existingSignal,
  };
}

const SELECT_WITH_SOURCE = "*, source:feed_sources(label)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Staged items still awaiting triage (review_state = 'new'), newest first. */
export async function listNewFeedItems(): Promise<FeedQueueItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .select(SELECT_WITH_SOURCE)
    .eq("review_state", "new")
    .order("fetched_at", { ascending: false });
  if (error) throw new Error(`listNewFeedItems failed: ${error.message}`);
  const rows = (data ?? []) as unknown as FeedItemRow[];

  // One batched lookup: which native ids already map to a signal? Importing such
  // an item LINKS to the existing signal (idempotent), so flag it for the admin.
  const existingByNativeId = await loadExistingSignals(
    db,
    rows.map((r) => r.source_native_id)
  );

  return rows.map((r) => mapItem(r, existingByNativeId.get(r.source_native_id) ?? null));
}

/** Map of source_native_id → existing signal, for the items passed in (read-only). */
async function loadExistingSignals(
  db: AdminDb,
  nativeIds: string[]
): Promise<Map<string, ExistingSignalRef>> {
  const out = new Map<string, ExistingSignalRef>();
  const unique = [...new Set(nativeIds)];
  if (unique.length === 0) return out;

  const { data, error } = await db
    .from("ozbargain_signals")
    .select("id, status, source_native_id")
    .in("source_native_id", unique);
  if (error) {
    throw new Error(`listNewFeedItems existing-signal lookup failed: ${error.message}`);
  }

  for (const row of (data ?? []) as {
    id: string;
    status: string;
    source_native_id: string | null;
  }[]) {
    if (row.source_native_id && !out.has(row.source_native_id)) {
      out.set(row.source_native_id, { id: row.id, status: row.status });
    }
  }
  return out;
}

/** Count of items awaiting triage — for the dashboard "Needs attention" row. */
export async function countNewFeedItems(): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("feed_items")
    .select("*", { count: "exact", head: true })
    .eq("review_state", "new");
  if (error) throw new Error(`countNewFeedItems failed: ${error.message}`);
  return count ?? 0;
}

// ── Promotion helpers ────────────────────────────────────────────────────────

const SUMMARY_MAX = 200;

/**
 * A short, safe summary: strip any markup from the raw feed text, collapse
 * whitespace, fall back to the title, and cap to ~200 chars. The admin reviews
 * and rewrites this on the pending signal before approval.
 */
function safeSummary(rawSummary: string, rawTitle: string): string {
  const base = (rawSummary || "").trim() || rawTitle;
  const text = base
    .replace(/<[^>]*>/g, " ") // drop any HTML tags from the stored raw text
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= SUMMARY_MAX) return text;
  return `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

/** Best-effort deal-kind guess from the title + categories. Admin can change it. */
function guessDealKind(title: string, categories: string[]): DealKind {
  const hay = `${title} ${categories.join(" ")}`.toLowerCase();
  if (/gift\s*card/.test(hay)) return "gift-card";
  if (/cashback/.test(hay)) return "cashback";
  if (/points|qantas|velocity|flybuys|everyday rewards|frequent flyer/.test(hay))
    return "points";
  if (/\bguide\b|how to|explained|comparison/.test(hay)) return "guide";
  return "discount-code";
}

/** Lowercase, hyphenated, alnum-only slug for a readable PK segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "signal"
  );
}

/**
 * Infer a merchant only when it's both matchable AND a real store row, so the
 * ozbargain_signals.merchant_id FK can never be violated. Returns null otherwise
 * — the admin can assign the store later.
 */
async function inferMerchantId(
  db: AdminDb,
  title: string
): Promise<string | null> {
  const candidate = findMerchantIdInText(title);
  if (!candidate) return null;
  const { data, error } = await db
    .from("stores")
    .select("id")
    .eq("id", candidate)
    .maybeSingle();
  if (error) throw new Error(`inferMerchantId failed: ${error.message}`);
  return data ? candidate : null;
}

/** Inserts a PENDING signal carrying the feed's source_native_id; returns its id. */
async function insertPendingSignalFromItem(
  db: AdminDb,
  item: FeedItemRow
): Promise<string> {
  const categories = item.categories ?? [];
  const merchantId = await inferMerchantId(db, item.raw_title);
  const id = `sig-${slugify(item.raw_title)}-${randomUUID().slice(0, 8)}`;

  const { error } = await db.from("ozbargain_signals").insert({
    id,
    // The dedupe key — lets a future re-import (or re-run) link instead of dupe.
    source_native_id: item.source_native_id,
    merchant_id: merchantId,
    title: item.raw_title,
    summary: safeSummary(item.raw_summary, item.raw_title),
    votes_sample: null,
    comment_count: null,
    sentiment: "neutral",
    deal_kind: guessDealKind(item.raw_title, categories),
    source_url: item.link,
    merchant_url: null,
    product_url: null,
    // feed_items.posted_at is a timestamptz; the signals column is a date.
    posted_at: item.posted_at ? item.posted_at.slice(0, 10) : null,
    expiry_date: null,
    tags: categories,
    promo_code: null,
    price_text: null,
    signal_score: null,
    confidence: "needs-verification",
    is_sample: false,
    // Never published by the importer — a human approves it later.
    status: "pending",
    last_checked_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(`insertPendingSignalFromItem failed: ${error.message}`);
  }
  return id;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Promote a staged item into a PENDING signal, idempotently:
 *   - if a signal already exists with this source_native_id, reuse it;
 *   - otherwise create one (status 'pending');
 * then mark the feed item 'imported' and link it. Never publishes.
 */
export async function importFeedItem(feedItemId: string): Promise<ImportResult> {
  const db = getSupabaseAdmin();

  const { data: itemData, error: itemErr } = await db
    .from("feed_items")
    .select("*")
    .eq("id", feedItemId)
    .maybeSingle();
  if (itemErr) throw new Error(`importFeedItem read failed: ${itemErr.message}`);
  if (!itemData) throw new Error("Feed item not found.");
  const item = itemData as unknown as FeedItemRow;

  // Idempotency: reuse any existing signal with the same source_native_id.
  const { data: existing, error: existErr } = await db
    .from("ozbargain_signals")
    .select("id")
    .eq("source_native_id", item.source_native_id)
    .maybeSingle();
  if (existErr) {
    throw new Error(`importFeedItem dedupe check failed: ${existErr.message}`);
  }

  let signalId: string;
  let created: boolean;
  if (existing) {
    signalId = (existing as { id: string }).id;
    created = false;
  } else {
    signalId = await insertPendingSignalFromItem(db, item);
    created = true;
  }

  const { error: updErr } = await db
    .from("feed_items")
    .update({ review_state: "imported", promoted_signal_id: signalId })
    .eq("id", feedItemId);
  if (updErr) throw new Error(`importFeedItem link failed: ${updErr.message}`);

  return { signalId, created };
}

/** Triage a staged item without importing it (ignore / mark duplicate). */
export async function setFeedItemReviewState(
  feedItemId: string,
  state: Extract<FeedReviewState, "ignored" | "duplicate">
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_items")
    .update({ review_state: state })
    .eq("id", feedItemId);
  if (error) throw new Error(`setFeedItemReviewState failed: ${error.message}`);
}

/**
 * Toggle whether a staged item is excluded from the public homepage Top 5.
 * This ONLY flips hidden_from_homepage — it deliberately leaves review_state
 * untouched, so the item stays in the import queue and remains importable. It
 * never publishes anything (the homepage shows already-staged items either way).
 */
export async function setFeedItemHomepageHidden(
  feedItemId: string,
  hidden: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_items")
    .update({ hidden_from_homepage: hidden })
    .eq("id", feedItemId);
  if (error) {
    throw new Error(`setFeedItemHomepageHidden failed: ${error.message}`);
  }
}
