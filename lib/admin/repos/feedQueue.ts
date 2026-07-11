import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  deriveFeedItemMetadata,
  type FeedItemMetadata,
} from "@/lib/admin/feedItemMetadata";
import { isApprovedOzBargainPostUrl } from "@/lib/security/urlPolicy";
import type { DealKind } from "@/lib/sources/types";

/**
 * Deal review queue repository — SERVICE-ROLE ONLY.
 *
 * Reads staged `feed_items` and approves them directly into public signals in
 * one reviewed transaction. Like the other admin repos
 * this must only run on the server behind requireAdmin(); the browser guard
 * inside getSupabaseAdmin() is the backstop.
 *
 * There is NO OzBargain fetching / scraping / agent here — it only reads/writes
 * our own Supabase project. Approval is always initiated by an authenticated
 * admin; fetching never calls it.
 */

export type FeedReviewState =
  | "new"
  | "imported"
  | "ignored"
  | "duplicate"
  | "rejected";

/**
 * Cap on rows the queue page loads per render — newest first. Matches
 * BULK_IGNORE_MAX in signals/queue/actions.ts so "Ignore visible" can
 * always cover one full page. Older items surface as the newer ones are
 * triaged; countNewFeedItems() still reports the true backlog.
 */
export const QUEUE_PAGE_LIMIT = 200;

/** Splits into runs of `size` (last run may be shorter). Pure, order-preserving. */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error(`chunk size must be positive, got ${size}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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
   * public homepage Top 5 ONLY — it stays in this queue and remains reviewable.
   * Orthogonal to reviewState (see migration 005).
   */
  hiddenFromHomepage: boolean;
  thumbnailUrl: string | null;
  metadata: FeedItemMetadata;
  /**
   * A signal that already exists with this source_native_id, if any. When set,
   * approval will LINK to it rather than create a new one (idempotent).
   */
  existingSignal: ExistingSignalRef | null;
}

/** Result of approval: which signal it maps to, and whether it was just made. */
export interface ApprovalResult {
  signalId: string;
  /** false = an existing signal with the same source_native_id was reused. */
  created: boolean;
}

export interface FeedApprovalOverrides {
  merchantId?: string | null;
  dealKind?: DealKind;
  priceText?: string | null;
  couponCode?: string | null;
  expiryDate?: string | null;
  score?: number | null;
}

const REVIEW_DEAL_KINDS = new Set<DealKind>([
  "discount-code",
  "cashback",
  "gift-card",
  "points",
  "guide",
]);

function optionalText(
  value: string | null | undefined,
  max: number,
  label: string
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim() === "") return null;
  const clean = value.trim();
  if (clean.length > max) throw new Error(`${label} is too long.`);
  return clean;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normaliseFeedApprovalOverrides(
  input: FeedApprovalOverrides = {}
): FeedApprovalOverrides {
  const merchantId = optionalText(input.merchantId, 100, "Store id");
  if (merchantId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(merchantId)) {
    throw new Error("Store id must be lowercase kebab-case.");
  }
  if (input.dealKind !== undefined && !REVIEW_DEAL_KINDS.has(input.dealKind)) {
    throw new Error("Deal kind is invalid.");
  }
  const priceText = optionalText(input.priceText, 80, "Price");
  const coupon = optionalText(input.couponCode, 32, "Coupon code");
  if (coupon && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(coupon)) {
    throw new Error("Coupon code contains unsupported characters.");
  }
  const expiryDate = optionalText(input.expiryDate, 10, "Expiry date");
  if (expiryDate && !validDate(expiryDate)) {
    throw new Error("Expiry date must be a real ISO calendar date.");
  }
  if (
    input.score !== undefined &&
    input.score !== null &&
    (!Number.isFinite(input.score) || input.score < 0 || input.score > 1_000_000)
  ) {
    throw new Error("Score must be between 0 and 1,000,000.");
  }
  return {
    ...(merchantId !== undefined ? { merchantId } : {}),
    ...(input.dealKind !== undefined ? { dealKind: input.dealKind } : {}),
    ...(priceText !== undefined ? { priceText } : {}),
    ...(coupon !== undefined ? { couponCode: coupon?.toUpperCase() ?? null } : {}),
    ...(expiryDate !== undefined ? { expiryDate } : {}),
    ...(input.score !== undefined ? { score: input.score } : {}),
  };
}

export interface ReviewedFeedItem {
  id: string;
  rawTitle: string;
  reviewState: "ignored" | "rejected";
  reviewedAt: string | null;
  reviewedBy: string | null;
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
  thumbnail_url: string | null;
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
    thumbnailUrl: r.thumbnail_url,
    metadata: deriveFeedItemMetadata({
      rawTitle: r.raw_title,
      rawSummary: r.raw_summary,
      categories: r.categories ?? [],
    }),
    existingSignal,
  };
}

const SELECT_WITH_SOURCE = "*, source:feed_sources(label)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Staged items still awaiting triage (review_state = 'new'), newest first. */
export async function listNewFeedItems(
  limit: number = QUEUE_PAGE_LIMIT
): Promise<FeedQueueItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .select(SELECT_WITH_SOURCE)
    .eq("review_state", "new")
    .order("fetched_at", { ascending: false })
    .limit(limit);
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

/**
 * Max ids per `.in()` call. PostgREST puts the filter in the GET querystring,
 * so an unbounded id list would eventually exceed URL length limits and fail
 * the whole read — independent of QUEUE_PAGE_LIMIT, which someone may raise.
 */
const SIGNAL_LOOKUP_CHUNK = 100;

/** Map of source_native_id → existing signal, for the items passed in (read-only). */
async function loadExistingSignals(
  db: AdminDb,
  nativeIds: string[]
): Promise<Map<string, ExistingSignalRef>> {
  const out = new Map<string, ExistingSignalRef>();
  const unique = [...new Set(nativeIds)];
  if (unique.length === 0) return out;

  // Sequential on purpose: 2 round trips at today's cap, simpler error
  // semantics than Promise.all, and the admin page is not latency-critical.
  for (const ids of chunk(unique, SIGNAL_LOOKUP_CHUNK)) {
    const { data, error } = await db
      .from("ozbargain_signals")
      .select("id, status, source_native_id")
      .in("source_native_id", ids);
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

export async function listRecentlyReviewedFeedItems(
  limit = 30
): Promise<ReviewedFeedItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .select("id, raw_title, review_state, reviewed_at, reviewed_by")
    .in("review_state", ["ignored", "rejected"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) {
    throw new Error(`listRecentlyReviewedFeedItems failed: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    rawTitle: row.raw_title,
    reviewState: row.review_state as "ignored" | "rejected",
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
  }));
}

/** An item archived by the expiry-recheck job (source confirmed gone). */
export interface ArchivedFeedItem {
  id: string;
  rawTitle: string;
  link: string;
  archiveReason: string | null;
  sourceStatus: string | null;
  archivedAt: string | null;
  lastValidatedAt: string | null;
  lastSourceCheckAt: string | null;
}

/**
 * Items archived out of active review because their OzBargain source was
 * confirmed expired/removed. Kept forever (never in the purge set) so History
 * and audit retain them. Read-only history view — not restorable via the queue.
 */
export async function listArchivedFeedItems(
  limit = 30
): Promise<ArchivedFeedItem[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .select(
      "id, raw_title, link, archive_reason, source_status, archived_at, last_validated_at, last_source_check_at"
    )
    .eq("review_state", "archived")
    .order("archived_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`listArchivedFeedItems failed: ${error.message}`);
  return (
    (data ?? []) as unknown as {
      id: string;
      raw_title: string;
      link: string;
      archive_reason: string | null;
      source_status: string | null;
      archived_at: string | null;
      last_validated_at: string | null;
      last_source_check_at: string | null;
    }[]
  ).map((row) => ({
    id: row.id,
    rawTitle: row.raw_title,
    link: row.link,
    archiveReason: row.archive_reason,
    sourceStatus: row.source_status,
    archivedAt: row.archived_at,
    lastValidatedAt: row.last_validated_at,
    lastSourceCheckAt: row.last_source_check_at,
  }));
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
 * Accept an inferred merchant only when it is also a real store row, so the
 * ozbargain_signals.merchant_id FK can never be violated. Returns null otherwise
 * — the admin can assign the store later.
 */
async function inferMerchantId(
  db: AdminDb,
  candidate: string | null
): Promise<string | null> {
  if (!candidate) return null;
  const { data, error } = await db
    .from("stores")
    .select("id")
    .eq("id", candidate)
    .maybeSingle();
  if (error) throw new Error(`inferMerchantId failed: ${error.message}`);
  return data ? candidate : null;
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Human approval in one DB transaction: create/reuse an APPROVED signal and
 * mark the queue row imported. The RPC locks the row and dedupes by native id.
 */
export async function approveFeedItem(
  feedItemId: string,
  overrides: FeedApprovalOverrides = {}
): Promise<ApprovalResult> {
  const db = getSupabaseAdmin();

  const { data: itemData, error: itemErr } = await db
    .from("feed_items")
    .select("*")
    .eq("id", feedItemId)
    .maybeSingle();
  if (itemErr) throw new Error(`approveFeedItem read failed: ${itemErr.message}`);
  if (!itemData) throw new Error("Feed item not found.");
  const item = itemData as unknown as FeedItemRow;
  if (!isApprovedOzBargainPostUrl(item.link)) {
    throw new Error("Feed item does not link to an approved OzBargain post.");
  }

  const metadata = deriveFeedItemMetadata({
    rawTitle: item.raw_title,
    rawSummary: item.raw_summary,
    categories: item.categories ?? [],
  });
  const clean = normaliseFeedApprovalOverrides(overrides);
  const merchantId = await inferMerchantId(
    db,
    clean.merchantId !== undefined ? clean.merchantId : metadata.merchantId
  );
  if (clean.merchantId && !merchantId) {
    throw new Error("Selected store does not exist.");
  }
  const signalId = `sig-${slugify(item.raw_title)}-${randomUUID().slice(0, 8)}`;
  const { data, error } = await db.rpc("approve_feed_item", {
    p_feed_item_id: feedItemId,
    p_expected_content_hash: item.content_hash,
    p_signal_id: signalId,
    p_merchant_id: merchantId,
    p_deal_kind: clean.dealKind ?? metadata.dealKind,
    p_price_text:
      clean.priceText !== undefined ? clean.priceText : metadata.priceText,
    p_promo_code:
      clean.couponCode !== undefined ? clean.couponCode : metadata.couponCode,
    p_expiry_date:
      clean.expiryDate !== undefined ? clean.expiryDate : metadata.expiryDate,
    p_signal_score: clean.score !== undefined ? clean.score : metadata.score,
  });
  if (error) throw new Error(`approveFeedItem failed: ${error.message}`);
  const result = data?.[0];
  if (!result) throw new Error("approveFeedItem returned no result.");
  return { signalId: result.signal_id, created: result.created };
}

/** Archive a rejected item; no source data is deleted. */
export async function rejectFeedItem(
  feedItemId: string,
  reviewerEmail: string
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .update({
      review_state: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerEmail.toLowerCase(),
    })
    .eq("id", feedItemId)
    .eq("review_state", "new")
    .select("id");
  if (error) throw new Error(`rejectFeedItem failed: ${error.message}`);
  if ((data?.length ?? 0) !== 1) {
    throw new Error("Feed item is no longer awaiting review.");
  }
}

/** Restore an archived queue decision to human review. */
export async function restoreFeedItem(feedItemId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .update({ review_state: "new", reviewed_at: null, reviewed_by: null })
    .eq("id", feedItemId)
    .in("review_state", ["ignored", "rejected"])
    .select("id");
  if (error) throw new Error(`restoreFeedItem failed: ${error.message}`);
  if (data?.length !== 1) {
    throw new Error("Feed item is not restorable or was already restored.");
  }
}

/**
 * Toggle whether a staged item is excluded from the public homepage Top 5.
 * This ONLY flips hidden_from_homepage — it deliberately leaves review_state
 * untouched, so the item stays in the review queue. It
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
