import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  hasLastCheckedAt,
  isApplyPlan,
  planOfferApplication,
  type OfferChangeCandidateInsert,
  type OfferChangeConfidence,
  type OfferChangeReviewState,
  type OfferSourceType,
} from "@/lib/monitor/offerChanges";

/**
 * Admin-side offer-change-candidates repository — SERVICE-ROLE ONLY.
 *
 * Backs the /admin/offer-changes review queue. Like the other admin repos it
 * talks to Supabase through getSupabaseAdmin() (which bypasses RLS) and must only
 * run on the server behind requireAdmin(); the browser guard inside
 * getSupabaseAdmin() is the backstop.
 *
 * Safety: staging writes (insertOfferChangeCandidates) only ever touch
 * offer_change_candidates and NEVER a published offer. The single place a
 * published offer changes is applyOfferChange(), which runs only from the admin
 * Apply action and only for a candidate still in review with a resolved target.
 * Ignoring / marking duplicate never touches public data. No scraping / fetching
 * / external calls live here — it talks only to our own Supabase project.
 */

/** Review states an admin can move a candidate INTO from the queue. */
export type OfferChangeManualState = Exclude<OfferChangeReviewState, "new" | "applied">;

/** A candidate as the admin review page sees it. */
export interface AdminOfferChange {
  id: string;
  sourceType: OfferSourceType;
  sourceName: string;
  merchantId: string | null;
  /** Joined store name for display; null when not merchant-specific. */
  storeName: string | null;
  targetId: string | null;
  detectedTitle: string;
  detectedRateOrDiscount: string;
  detectedUrl: string;
  previousValue: string | null;
  proposedValue: string;
  confidence: OfferChangeConfidence;
  rawSummary: string;
  contentHash: string;
  reviewState: OfferChangeReviewState;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface OfferChangeRow {
  id: string;
  source_type: OfferSourceType;
  source_name: string;
  merchant_id: string | null;
  target_id: string | null;
  detected_title: string;
  detected_rate_or_discount: string;
  detected_url: string;
  previous_value: string | null;
  proposed_value: string;
  confidence: OfferChangeConfidence;
  raw_summary: string;
  content_hash: string;
  review_state: OfferChangeReviewState;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapOfferChange(r: OfferChangeRow): AdminOfferChange {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
  return {
    id: r.id,
    sourceType: r.source_type,
    sourceName: r.source_name,
    merchantId: r.merchant_id,
    storeName: store?.name ?? null,
    targetId: r.target_id,
    detectedTitle: r.detected_title,
    detectedRateOrDiscount: r.detected_rate_or_discount,
    detectedUrl: r.detected_url,
    previousValue: r.previous_value,
    proposedValue: r.proposed_value,
    confidence: r.confidence,
    rawSummary: r.raw_summary,
    contentHash: r.content_hash,
    reviewState: r.review_state,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at,
    createdAt: r.created_at,
  };
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Candidates in a given triage state (defaults to the 'new' review queue). */
export async function listOfferChanges(
  reviewState: OfferChangeReviewState = "new"
): Promise<AdminOfferChange[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .select(SELECT_WITH_STORE)
    .eq("review_state", reviewState)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listOfferChanges failed: ${error.message}`);
  return ((data ?? []) as unknown as OfferChangeRow[]).map(mapOfferChange);
}

/** Count of candidates still awaiting review. */
export async function countNewOfferChanges(): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from("offer_change_candidates")
    .select("id", { count: "exact", head: true })
    .eq("review_state", "new");
  if (error) throw new Error(`countNewOfferChanges failed: ${error.message}`);
  return count ?? 0;
}

/** A single candidate by id, or null when it does not exist. */
export async function getOfferChange(
  id: string
): Promise<AdminOfferChange | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOfferChange failed: ${error.message}`);
  if (!data) return null;
  return mapOfferChange(data as unknown as OfferChangeRow);
}

// ── Staging write (monitor) ───────────────────────────────────────────────────

/**
 * Stage detected changes as `offer_change_candidates` (review_state 'new'),
 * ignoring conflicts on content_hash so re-runs are idempotent and never clobber
 * an admin's triage. Returns the number of NEW rows inserted. NEVER touches a
 * published offer — that only happens on admin Apply.
 */
export async function insertOfferChangeCandidates(
  rows: OfferChangeCandidateInsert[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("offer_change_candidates")
    .upsert(
      rows.map((r) => ({ ...r, review_state: "new" })),
      { onConflict: "content_hash", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    throw new Error(`insertOfferChangeCandidates failed: ${error.message}`);
  }
  return data?.length ?? 0;
}

// ── Review actions ─────────────────────────────────────────────────────────────

export interface ApplyResult {
  table: string;
  column: string;
  targetId: string;
  value: number;
  merchantId: string | null;
}

/**
 * Apply a candidate to its target offer — the ONLY path that mutates a published
 * offer. Reads the candidate, asks the pure planner what (if anything) to change,
 * and refuses unless it is still 'new' with a resolved, numeric target. Updates
 * exactly one column on exactly one offer row, then marks the candidate
 * 'applied'. Called only from the admin Apply action (after requireAdmin + an
 * explicit confirm).
 */
export async function applyOfferChange(
  id: string,
  reviewerEmail: string | null
): Promise<ApplyResult> {
  const db = getSupabaseAdmin();
  const candidate = await getOfferChange(id);
  if (!candidate) throw new Error("Offer change candidate not found.");

  const plan = planOfferApplication({
    sourceType: candidate.sourceType,
    reviewState: candidate.reviewState,
    targetId: candidate.targetId,
    proposedValue: candidate.proposedValue,
  });
  if (!isApplyPlan(plan)) throw new Error(`Cannot apply: ${plan.skip}.`);

  // 1) Update ONLY the targeted offer row's single numeric field.
  const offerUpdate: Record<string, unknown> = { [plan.column]: plan.value };
  if (hasLastCheckedAt(plan.table)) {
    offerUpdate.last_checked_at = new Date().toISOString();
  }
  const { error: offerErr } = await db
    .from(plan.table)
    .update(offerUpdate)
    .eq("id", plan.id);
  if (offerErr) {
    throw new Error(`applyOfferChange offer update failed: ${offerErr.message}`);
  }

  // 2) Mark the candidate applied (record who/when).
  const { error: candErr } = await db
    .from("offer_change_candidates")
    .update({
      review_state: "applied",
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (candErr) {
    throw new Error(`applyOfferChange candidate update failed: ${candErr.message}`);
  }

  return {
    table: plan.table,
    column: plan.column,
    targetId: plan.id,
    value: plan.value,
    merchantId: candidate.merchantId,
  };
}

/**
 * Dismiss a candidate as not relevant ('ignored') or already covered
 * ('duplicate'). Touches ONLY the staging row — never a published offer — so
 * reviewing an item away can never change public data.
 */
export async function setOfferChangeReviewState(
  id: string,
  state: OfferChangeManualState,
  reviewerEmail: string | null
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("offer_change_candidates")
    .update({
      review_state: state,
      reviewed_by: reviewerEmail,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    throw new Error(`setOfferChangeReviewState failed: ${error.message}`);
  }
}
