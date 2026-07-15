/**
 * GCDB prediction persistence (TASK-06) — service-role only, strictly isolated.
 *
 * Predictions live in `gift_card_offer_predictions` (migration 029, authored/
 * not-yet-applied — RLS default-deny, service-role only). They are NEVER written
 * to gift_card_offers and never reach a public read path; this module only
 * stages forecasts and records reconciliation outcomes.
 *
 * IDENTITY: migration 029 generates and uniquely enforces a fingerprint over
 * source + normalised seller + sorted/deduplicated families + predicted window.
 * Re-capture uses ON CONFLICT DO NOTHING, so ORIGINAL predicted facts are never
 * overwritten. The database immutability trigger independently rejects changes
 * to those facts; only outcome fields may change after capture.
 *
 * `run_kind`-style boundary casts: `gift_card_offer_predictions` is absent from
 * the generated types until 029 is applied, so the table handle is narrowed with
 * `as never`. Remove the cast when types regenerate.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ParsedPrediction } from "@/lib/giftcards/parsePredictions";
import {
  GCDB_PREDICTIONS_SOURCE_ID,
  GCDB_PREDICTIONS_URL,
} from "@/lib/giftcards/parsePredictions";
import type {
  PredictionOutcome,
  PredictionReconcileResult,
} from "@/lib/giftcards/reconcilePredictions";

const TABLE = "gift_card_offer_predictions";

/** 029 status vocabulary. Predictions start `predicted`; markers never change it. */
export type PredictionStatus =
  | "predicted"
  | "confirmed"
  | "historical"
  | "prediction_matched"
  | "prediction_missed"
  | "prediction_partially_matched";

export interface UpsertPredictionsResult {
  available: boolean;
  inserted: number;
  preserved: number;
}

export interface AdminPredictionRow {
  id: string;
  predictedSeller: string | null;
  predictedFamilies: string[];
  predictedPromotionText: string | null;
  predictedPromotionType: string | null;
  predictedValue: string | null;
  predictedStartsAt: string | null;
  predictedEndsAt: string | null;
  sourceReferenceUrl: string | null;
  sourceMarker: string | null;
  fingerprint: string;
  status: PredictionStatus;
  linkedOfferId: string | null;
  comparisonNotes: string | null;
  createdAt: string;
}

export async function listPredictions(): Promise<{
  available: boolean;
  rows: AdminPredictionRow[];
}> {
  const { data, error } = await predTable()
    .select("*" as never)
    .order("created_at" as never, { ascending: false })
    .limit(1000);
  if (error) {
    if (["42P01", "PGRST205"].includes(error.code ?? "")) {
      return { available: false, rows: [] };
    }
    throw new Error(`list predictions failed: ${error.message}`);
  }
  const rows = (data ?? []) as unknown as Array<{
    id: string; predicted_seller: string | null; predicted_families: string[];
    predicted_promotion_text?: string | null;
    predicted_promotion_type: string | null; predicted_value: string | null;
    predicted_starts_at: string | null; predicted_ends_at: string | null;
    source_reference_url?: string | null; source_marker?: string | null;
    fingerprint?: string;
    status: PredictionStatus; linked_offer_id: string | null;
    comparison_notes: string | null; created_at: string;
  }>;
  return {
    available: true,
    rows: rows.map((row) => ({
      id: row.id,
      predictedSeller: row.predicted_seller,
      predictedFamilies: row.predicted_families ?? [],
      predictedPromotionText: row.predicted_promotion_text ?? null,
      predictedPromotionType: row.predicted_promotion_type,
      predictedValue: row.predicted_value,
      predictedStartsAt: row.predicted_starts_at,
      predictedEndsAt: row.predicted_ends_at,
      sourceReferenceUrl: row.source_reference_url ?? null,
      sourceMarker: row.source_marker ?? null,
      fingerprint: row.fingerprint ?? "",
      status: row.status,
      linkedOfferId: row.linked_offer_id,
      comparisonNotes: row.comparison_notes,
      createdAt: row.created_at,
    })),
  };
}

export async function updatePredictionReview(
  id: string,
  patch: {
    status: Exclude<PredictionStatus, "predicted" | "confirmed" | "historical">;
    linkedOfferId: string | null;
    comparisonNotes: string | null;
  },
): Promise<void> {
  const { data, error } = await predTable()
    .update({
      status: patch.status,
      linked_offer_id: patch.linkedOfferId,
      comparison_notes: patch.comparisonNotes,
      reviewed_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, id as never)
    .eq("status" as never, "predicted" as never)
    .select("id" as never)
    .maybeSingle();
  if (error) throw new Error(`update prediction review failed: ${error.message}`);
  if (!data) {
    throw new Error("Prediction is no longer awaiting an outcome review.");
  }
}

/**
 * Map a reconciliation outcome to a 029 status. `pending` stays `predicted`;
 * everything else records whether the confirmed reality matched. This is the
 * ONLY place an outcome changes a prediction's status.
 */
export function outcomeToStatus(outcome: PredictionOutcome): PredictionStatus {
  switch (outcome) {
    case "exact-match":
      return "prediction_matched";
    case "partial-match":
    case "different-value":
    case "different-dates":
      return "prediction_partially_matched";
    case "different-family":
    case "different-seller":
    case "no-promotion":
    case "did-not-occur":
      return "prediction_missed";
    case "pending":
    default:
      return "predicted";
  }
}

function predTable() {
  // 029 is not in generated types yet; narrow the table handle at the boundary.
  return getSupabaseAdmin().from(TABLE as never);
}

/**
 * Stage parsed predictions with one insert-only batch. The database-generated
 * source/fingerprint unique key makes exact re-capture and concurrent capture
 * idempotent. ON CONFLICT DO NOTHING preserves every original prediction fact.
 * A source marker is stored verbatim in its own immutable column and is never
 * interpreted as an outcome.
 */
export async function upsertPredictions(
  parsed: ParsedPrediction[],
  meta: { sourceUrl: string; sourceLastUpdated: string | null }
): Promise<UpsertPredictionsResult> {
  if (meta.sourceUrl !== GCDB_PREDICTIONS_URL) {
    throw new Error("Prediction captures must use the canonical GCDB predictions URL.");
  }
  if (parsed.length === 0) {
    return { available: true, inserted: 0, preserved: 0 };
  }
  const rows = parsed.map((p) => ({
    source_id: GCDB_PREDICTIONS_SOURCE_ID,
    source_url: meta.sourceUrl,
    source_last_updated: meta.sourceLastUpdated,
    predicted_seller: p.predictedSeller,
    predicted_families: p.predictedFamilies,
    predicted_promotion_text: p.predictedPromotionText,
    predicted_promotion_type: p.predictedPromotionType,
    predicted_value: p.predictedValue,
    predicted_discount_percent: p.predictedDiscountPercent,
    predicted_starts_at: p.predictedStartsAt,
    predicted_ends_at: p.predictedEndsAt,
    source_reference_url: p.refUrl,
    source_marker: p.rawMarker,
    status: "predicted",
  }));
  const { data, error } = await predTable()
    .upsert(rows as never, {
      onConflict: "source_id,fingerprint",
      ignoreDuplicates: true,
    })
    .select("fingerprint" as never);
  if (error) {
    if (["42P01", "42703", "42P10", "PGRST204", "PGRST205"].includes(error.code ?? "")) {
      return { available: false, inserted: 0, preserved: 0 };
    }
    throw new Error(`upsertPredictions insert failed: ${error.message}`);
  }
  const inserted = Array.isArray(data) ? data.length : 0;
  return { available: true, inserted, preserved: parsed.length - inserted };
}

/**
 * Record reconciliation outcomes. Updates ONLY status, linked_offer_id and
 * comparison_notes (+ reviewed_at) — the original predicted fields are never
 * overwritten, so a matched or missed prediction retains its forecast for
 * accuracy analysis.
 */
export async function applyPredictionOutcomes(
  results: PredictionReconcileResult[],
  now: Date
): Promise<number> {
  let updated = 0;
  for (const r of results) {
    const patch: Record<string, unknown> = {
      status: outcomeToStatus(r.outcome),
      linked_offer_id: r.linkedOfferId,
      reviewed_at: now.toISOString(),
    };
    if (r.detail) patch.comparison_notes = r.detail;
    const { error } = await predTable()
      .update(patch as never)
      .eq("id" as never, r.predictionId as never);
    if (error) {
      throw new Error(`applyPredictionOutcomes failed: ${error.message}`);
    }
    updated += 1;
  }
  return updated;
}

/**
 * Idempotent reconciliation adapter. Only a still-predicted private row may be
 * resolved, `pending` performs no write, and missing migration 029 is a
 * controlled no-op. The original forecast fields are never part of the patch.
 */
export async function recordPredictionReconcileOutcome(
  result: PredictionReconcileResult,
  now: Date,
): Promise<"updated" | "already-reviewed" | "pending" | "schema-missing"> {
  if (result.outcome === "pending") return "pending";
  const patch: Record<string, unknown> = {
    status: outcomeToStatus(result.outcome),
    linked_offer_id: result.linkedOfferId,
    reviewed_at: now.toISOString(),
  };
  if (result.detail) patch.comparison_notes = result.detail;
  const updated = await predTable()
    .update(patch as never)
    .eq("id" as never, result.predictionId as never)
    .eq("status" as never, "predicted" as never)
    .select("id" as never)
    .maybeSingle();
  if (updated.error) {
    if (["42P01", "42703", "PGRST204", "PGRST205"].includes(updated.error.code ?? "")) {
      return "schema-missing";
    }
    throw new Error(`record prediction reconcile outcome failed: ${updated.error.message}`);
  }
  if (!updated.data) return "already-reviewed";

  const { error: auditError } = await getSupabaseAdmin().from("audit_log").insert({
    actor_email: null,
    action: "gift-card-prediction-reconcile",
    table_name: TABLE,
    row_id: result.predictionId,
    diff: {
      outcome: result.outcome,
      linkedOfferId: result.linkedOfferId,
      reviewedAt: now.toISOString(),
      publicOfferMutated: false,
    } as never,
  });
  if (auditError) {
    throw new Error(`prediction reconcile audit failed: ${auditError.message}`);
  }
  return "updated";
}
