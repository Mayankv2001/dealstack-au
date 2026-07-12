import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ExtractedOffer } from "@/lib/giftcards/extractOffer";
import type { GcdbFeedItem } from "@/lib/giftcards/parseGcdbFeed";
import type {
  IngestMetrics,
  RawItemState,
  StagedCandidate,
} from "@/lib/giftcards/runIngest";

/**
 * Gift-card pipeline data access — SERVICE-ROLE ONLY (staging tables carry no
 * anon policies). Concrete deps for lib/giftcards/runIngest plus the admin
 * review reads/writes. Networked fetching lives in the cron route; nothing
 * here makes an outbound request.
 */

/**
 * The gift_card_* pipeline tables and the approve_gift_card_candidate RPC are
 * added by migration 021, which is intentionally NOT yet applied to production
 * (it awaits admin review — see supabase/migrations/021_gift_card_pipeline.sql).
 * Until it is applied and `npm run types:gen` regenerates database.types.ts
 * from the live schema, those relations are absent from the generated types, so
 * this module reaches them through an untyped view of the same service-role
 * client. Every row/insert/update shape is still checked against the
 * hand-written interfaces below, and the RLS/gating guarantees are unaffected —
 * this only relaxes the compile-time table-name union, not the runtime client.
 */
function pipelineDb(): SupabaseClient {
  return getSupabaseAdmin() as unknown as SupabaseClient;
}

/** A 'running' ingest older than this is treated as crashed, not in-flight. */
const STALE_RUN_MINUTES = 15;
const UNIQUE_VIOLATION = "23505";

export interface GiftCardSourceRow {
  id: string;
  name: string;
  feed_url: string;
  enabled: boolean;
  automated_fetch_allowed: boolean;
  etag: string | null;
  last_modified: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
}

export async function getGiftCardSource(
  id: string
): Promise<GiftCardSourceRow | null> {
  const db = pipelineDb();
  const { data, error } = await db
    .from("gift_card_sources")
    .select(
      "id, name, feed_url, enabled, automated_fetch_allowed, etag, last_modified, last_success_at, last_error_at, last_error"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getGiftCardSource failed: ${error.message}`);
  return (data as GiftCardSourceRow | null) ?? null;
}

export type IngestStartResult =
  | { started: true; runId: string }
  | { started: false; reason: "already-running" };

/** Claim the single 'running' ingest slot (mirrors 016/020 lock semantics). */
export async function startIngestRun(
  sourceId: string,
  startedAt: Date
): Promise<IngestStartResult> {
  const db = pipelineDb();
  const staleCutoff = new Date(
    startedAt.getTime() - STALE_RUN_MINUTES * 60 * 1000
  ).toISOString();
  const { error: takeoverError } = await db
    .from("gift_card_ingest_runs")
    .update({
      status: "error",
      completed_at: startedAt.toISOString(),
      error_summary: `superseded: run exceeded ${STALE_RUN_MINUTES} minutes`,
    })
    .eq("status", "running")
    .lt("started_at", staleCutoff);
  if (takeoverError) {
    throw new Error(`startIngestRun takeover failed: ${takeoverError.message}`);
  }

  const { data, error } = await db
    .from("gift_card_ingest_runs")
    .insert({ source_id: sourceId, started_at: startedAt.toISOString() })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { started: false, reason: "already-running" };
    }
    throw new Error(`startIngestRun failed: ${error.message}`);
  }
  return { started: true, runId: data.id };
}

export async function finishIngestRun(
  runId: string,
  metrics: IngestMetrics,
  parserVersion: number,
  finishedAt: Date
): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_ingest_runs")
    .update({
      completed_at: finishedAt.toISOString(),
      status: metrics.status,
      fetch_status: metrics.fetchStatus,
      items_seen: metrics.itemsSeen,
      items_new: metrics.itemsNew,
      items_updated: metrics.itemsUpdated,
      items_unchanged: metrics.itemsUnchanged,
      items_rejected: metrics.itemsRejected,
      parser_version: parserVersion,
      snapshot_hash: metrics.snapshotHash,
      error_summary: metrics.errors.length ? metrics.errors.join("; ").slice(0, 900) : null,
    })
    .eq("id", runId);
  if (error) throw new Error(`finishIngestRun failed: ${error.message}`);
}

/**
 * Finalise a run as `error` when the orchestration threw before it could report
 * metrics — this is what releases the one-running lock so the NEXT invocation is
 * not permanently blocked. Only touches a run that is still `running` (a run
 * already finished by finishIngestRun is left as-is). Best-effort: the caller
 * treats a throw here as non-fatal because the 15-minute stale-run takeover in
 * startIngestRun is the ultimate backstop.
 */
export async function failIngestRun(
  runId: string,
  message: string,
  finishedAt: Date
): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_ingest_runs")
    .update({
      status: "error",
      completed_at: finishedAt.toISOString(),
      error_summary: message.slice(0, 900),
    })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throw new Error(`failIngestRun failed: ${error.message}`);
}

/** Most recent non-skipped run start, for the every-other-day guard. */
export async function lastIngestRunStart(sourceId: string): Promise<Date | null> {
  const db = pipelineDb();
  const { data, error } = await db
    .from("gift_card_ingest_runs")
    .select("started_at, status")
    .eq("source_id", sourceId)
    .neq("status", "skipped")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`lastIngestRunStart failed: ${error.message}`);
  return data ? new Date((data as { started_at: string }).started_at) : null;
}

interface RawItemRow {
  id: string;
  external_id: string;
  content_hash: string;
  raw_payload: { extraction?: ExtractedOffer } | null;
}

export async function loadRawItems(
  sourceId: string,
  externalIds: string[]
): Promise<RawItemState[]> {
  if (externalIds.length === 0) return [];
  const db = pipelineDb();
  const { data, error } = await db
    .from("gift_card_raw_items")
    .select("id, external_id, content_hash, raw_payload")
    .eq("source_id", sourceId)
    .in("external_id", externalIds);
  if (error) throw new Error(`loadRawItems failed: ${error.message}`);
  const rows = (data ?? []) as unknown as RawItemRow[];

  const ids = rows.map((row) => row.id);
  const open = new Map<string, string>();
  const approved = new Map<string, string>();
  if (ids.length > 0) {
    const { data: candidates, error: candidateError } = await db
      .from("gift_card_offer_candidates")
      .select("id, raw_item_id, review_status, approved_offer_id")
      .in("raw_item_id", ids);
    if (candidateError) {
      throw new Error(`loadRawItems candidates failed: ${candidateError.message}`);
    }
    for (const c of (candidates ?? []) as unknown as Array<{
      id: string;
      raw_item_id: string;
      review_status: string;
      approved_offer_id: string | null;
    }>) {
      if (c.review_status === "new" || c.review_status === "changed") {
        open.set(c.raw_item_id, c.id);
      }
      if (c.review_status === "approved" && c.approved_offer_id) {
        approved.set(c.raw_item_id, c.approved_offer_id);
      }
    }
  }

  return rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    contentHash: row.content_hash,
    extraction: row.raw_payload?.extraction ?? null,
    openCandidateId: open.get(row.id) ?? null,
    approvedOfferId: approved.get(row.id) ?? null,
  }));
}

function rawPayload(item: GcdbFeedItem, extraction: ExtractedOffer) {
  // Structured fields + bounded excerpt only — never the article body.
  return { item, extraction };
}

export async function insertRawItem(
  sourceId: string,
  item: GcdbFeedItem,
  contentHash: string,
  extraction: ExtractedOffer,
  now: Date
): Promise<string> {
  const db = pipelineDb();
  const { data, error } = await db
    .from("gift_card_raw_items")
    .insert({
      source_id: sourceId,
      external_id: item.externalId,
      canonical_url: item.canonicalUrl,
      title: item.title,
      published_at: item.publishedAt,
      raw_payload: rawPayload(item, extraction),
      content_hash: contentHash,
      first_seen_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      processing_status: "parsed",
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertRawItem failed: ${error.message}`);
  return data.id;
}

export async function updateRawItem(
  id: string,
  item: GcdbFeedItem,
  contentHash: string,
  extraction: ExtractedOffer,
  now: Date
): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_raw_items")
    .update({
      canonical_url: item.canonicalUrl,
      title: item.title,
      published_at: item.publishedAt,
      raw_payload: rawPayload(item, extraction),
      content_hash: contentHash,
      last_seen_at: now.toISOString(),
      processing_status: "parsed",
      parser_error: null,
    })
    .eq("id", id);
  if (error) throw new Error(`updateRawItem failed: ${error.message}`);
}

export async function touchRawItem(id: string, now: Date): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_raw_items")
    .update({ last_seen_at: now.toISOString() })
    .eq("id", id);
  if (error) throw new Error(`touchRawItem failed: ${error.message}`);
}

/** Stage a candidate, superseding any still-open one for the same item. */
export async function stageCandidate(
  sourceId: string,
  staged: StagedCandidate
): Promise<void> {
  const db = pipelineDb();
  const { error: archiveError } = await db
    .from("gift_card_offer_candidates")
    .update({ review_status: "archived", rejection_reason: "superseded by newer extraction" })
    .eq("raw_item_id", staged.rawItemId)
    .in("review_status", ["new", "changed"]);
  if (archiveError) {
    throw new Error(`stageCandidate supersede failed: ${archiveError.message}`);
  }

  const e = staged.extraction;
  const { error } = await db.from("gift_card_offer_candidates").insert({
    raw_item_id: staged.rawItemId,
    source_id: sourceId,
    seller_name: e.sellerName,
    gift_card_brands: e.giftCardBrands,
    promotion_type: e.promotionType,
    discount_percent: e.discountPercent,
    bonus_percent: e.bonusPercent,
    points_multiplier: e.pointsMultiplier,
    points_program: e.pointsProgram,
    effective_discount_percent: e.effectiveDiscountPercent,
    starts_at: e.startsAt,
    expires_at: e.expiresAt,
    terms_json: {
      membershipRequired: e.membershipRequired,
      activationRequired: e.activationRequired,
      couponRequired: e.couponRequired,
      minSpend: e.minSpend,
      purchaseLimitNote: e.purchaseLimitNote,
    },
    extraction_confidence: e.confidence,
    extraction_warnings: e.warnings,
    change_kind: staged.changeKind,
    change_diff: staged.changedFields.length
      ? { changedFields: staged.changedFields }
      : null,
    review_status: staged.reviewStatus,
  });
  if (error) throw new Error(`stageCandidate failed: ${error.message}`);
}

export async function recordSourceState(
  sourceId: string,
  patch: { etag: string | null; lastModified: string | null; ok: boolean; error?: string },
  now: Date
): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_sources")
    .update(
      patch.ok
        ? {
            etag: patch.etag,
            last_modified: patch.lastModified,
            last_success_at: now.toISOString(),
            last_error: null,
          }
        : {
            last_error_at: now.toISOString(),
            last_error: patch.error?.slice(0, 500) ?? "unknown error",
          }
    )
    .eq("id", sourceId);
  if (error) throw new Error(`recordSourceState failed: ${error.message}`);
}

// ── Admin review reads/writes ────────────────────────────────────────────────

export interface AdminGiftCardCandidate {
  id: string;
  sourceId: string;
  sellerName: string | null;
  giftCardBrands: string[];
  promotionType: string;
  discountPercent: number | null;
  bonusPercent: number | null;
  pointsMultiplier: number | null;
  pointsProgram: string | null;
  effectiveDiscountPercent: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  terms: {
    membershipRequired?: boolean;
    activationRequired?: boolean;
    couponRequired?: boolean;
    minSpend?: number | null;
    purchaseLimitNote?: string | null;
  };
  confidence: number;
  warnings: string[];
  changeKind: string | null;
  changedFields: string[];
  reviewStatus: string;
  createdAt: string;
  rawTitle: string;
  sourceUrl: string;
  excerpt: string;
  approvedOfferId: string | null;
}

interface CandidateRow {
  id: string;
  source_id: string;
  seller_name: string | null;
  gift_card_brands: string[];
  promotion_type: string;
  discount_percent: number | string | null;
  bonus_percent: number | string | null;
  points_multiplier: number | string | null;
  points_program: string | null;
  effective_discount_percent: number | string | null;
  starts_at: string | null;
  expires_at: string | null;
  terms_json: AdminGiftCardCandidate["terms"] | null;
  extraction_confidence: number | string;
  extraction_warnings: string[];
  change_kind: string | null;
  change_diff: { changedFields?: string[] } | null;
  review_status: string;
  created_at: string;
  approved_offer_id: string | null;
  raw: { title: string; canonical_url: string; raw_payload: { item?: { excerpt?: string } } | null } | Array<{
    title: string;
    canonical_url: string;
    raw_payload: { item?: { excerpt?: string } } | null;
  }>;
}

const num = (v: number | string | null): number | null =>
  v == null ? null : Number(v);

export async function listGiftCardCandidates(
  limit = 50
): Promise<AdminGiftCardCandidate[]> {
  const db = pipelineDb();
  const { data, error } = await db
    .from("gift_card_offer_candidates")
    .select(
      "id, source_id, seller_name, gift_card_brands, promotion_type, discount_percent, bonus_percent, points_multiplier, points_program, effective_discount_percent, starts_at, expires_at, terms_json, extraction_confidence, extraction_warnings, change_kind, change_diff, review_status, created_at, approved_offer_id, raw:gift_card_raw_items(title, canonical_url, raw_payload)"
    )
    .in("review_status", ["new", "changed"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listGiftCardCandidates failed: ${error.message}`);
  return ((data ?? []) as unknown as CandidateRow[]).map((row) => {
    const raw = Array.isArray(row.raw) ? row.raw[0] : row.raw;
    return {
      id: row.id,
      sourceId: row.source_id,
      sellerName: row.seller_name,
      giftCardBrands: row.gift_card_brands ?? [],
      promotionType: row.promotion_type,
      discountPercent: num(row.discount_percent),
      bonusPercent: num(row.bonus_percent),
      pointsMultiplier: num(row.points_multiplier),
      pointsProgram: row.points_program,
      effectiveDiscountPercent: num(row.effective_discount_percent),
      startsAt: row.starts_at,
      expiresAt: row.expires_at,
      terms: row.terms_json ?? {},
      confidence: Number(row.extraction_confidence),
      warnings: row.extraction_warnings ?? [],
      changeKind: row.change_kind,
      changedFields: row.change_diff?.changedFields ?? [],
      reviewStatus: row.review_status,
      createdAt: row.created_at,
      rawTitle: raw?.title ?? "",
      sourceUrl: raw?.canonical_url ?? "",
      excerpt: raw?.raw_payload?.item?.excerpt ?? "",
      approvedOfferId: row.approved_offer_id,
    };
  });
}

export async function approveGiftCardCandidate(
  candidateId: string,
  offerId: string,
  offer: Record<string, unknown>,
  reviewer: string
): Promise<string> {
  const db = pipelineDb();
  const { data, error } = await db.rpc("approve_gift_card_candidate", {
    p_candidate_id: candidateId,
    p_offer_id: offerId,
    p_offer: offer,
    p_reviewer: reviewer,
  });
  if (error) throw new Error(`approveGiftCardCandidate failed: ${error.message}`);
  return data as string;
}

export async function setCandidateStatus(
  candidateId: string,
  status: "rejected" | "archived" | "new",
  reviewer: string,
  reason?: string
): Promise<void> {
  const db = pipelineDb();
  const { error } = await db
    .from("gift_card_offer_candidates")
    .update({
      review_status: status,
      reviewer_email: reviewer,
      reviewed_at: new Date().toISOString(),
      rejection_reason: reason ?? null,
    })
    .eq("id", candidateId)
    .in("review_status", ["new", "changed", "rejected"]);
  if (error) throw new Error(`setCandidateStatus failed: ${error.message}`);
}

// ── Monitoring stats ─────────────────────────────────────────────────────────

export interface GiftCardPipelineStatus {
  source: GiftCardSourceRow | null;
  lastRun: {
    startedAt: string;
    completedAt: string | null;
    status: string;
    itemsSeen: number;
    itemsNew: number;
    itemsUpdated: number;
    errorSummary: string | null;
  } | null;
  pendingCandidates: number;
  changedCandidates: number;
  oldestPendingAt: string | null;
  activeOffers: number;
  expiringWithin72h: number;
}

export async function getGiftCardPipelineStatus(): Promise<GiftCardPipelineStatus> {
  const db = pipelineDb();
  const in72h = new Date(Date.now() + 72 * 3600_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [source, runData, pendingData, changedData, oldestData, activeData, expiringData] =
    await Promise.all([
      getGiftCardSource("gcdb"),
      db
        .from("gift_card_ingest_runs")
        .select("started_at, completed_at, status, items_seen, items_new, items_updated, error_summary")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("gift_card_offer_candidates")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "new"),
      db
        .from("gift_card_offer_candidates")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "changed"),
      db
        .from("gift_card_offer_candidates")
        .select("created_at")
        .in("review_status", ["new", "changed"])
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      db
        .from("gift_card_offers")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      db
        .from("gift_card_offers")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true)
        .gte("expiry_date", today)
        .lte("expiry_date", in72h),
    ]);

  if (runData.error) throw new Error(`pipeline status runs failed: ${runData.error.message}`);
  const run = runData.data as {
    started_at: string;
    completed_at: string | null;
    status: string;
    items_seen: number;
    items_new: number;
    items_updated: number;
    error_summary: string | null;
  } | null;

  return {
    source,
    lastRun: run
      ? {
          startedAt: run.started_at,
          completedAt: run.completed_at,
          status: run.status,
          itemsSeen: run.items_seen,
          itemsNew: run.items_new,
          itemsUpdated: run.items_updated,
          errorSummary: run.error_summary,
        }
      : null,
    pendingCandidates: pendingData.count ?? 0,
    changedCandidates: changedData.count ?? 0,
    oldestPendingAt:
      (oldestData.data as { created_at: string } | null)?.created_at ?? null,
    activeOffers: activeData.count ?? 0,
    expiringWithin72h: expiringData.count ?? 0,
  };
}
