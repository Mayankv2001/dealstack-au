"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit } from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  updatePredictionReview,
  upsertPredictions,
} from "@/lib/admin/repos/giftCardPredictions";
import {
  GCDB_PREDICTIONS_URL,
  parseGcdbPredictions,
} from "@/lib/giftcards/parsePredictions";

export type PredictionActionState = { error?: string; success?: string };

const MAX_SNAPSHOT_BYTES = 1_000_000;

async function predictionSnapshot(form: FormData): Promise<string | { error: string }> {
  const pasted = String(form.get("snapshot_html") ?? "").trim();
  const uploaded = form.get("snapshot_file");
  const file =
    uploaded && typeof uploaded === "object" && "text" in uploaded && "size" in uploaded
      ? (uploaded as { size: number; type?: string; text(): Promise<string> })
      : null;
  const hasFile = Boolean(file && file.size > 0);
  if (pasted && hasFile) return { error: "Paste a snapshot or upload one file, not both." };
  if (!pasted && !hasFile) return { error: "Paste or upload a captured GCDB predictions HTML snapshot." };
  if (file && hasFile) {
    if (file.size > MAX_SNAPSHOT_BYTES) return { error: "Prediction snapshot must be 1 MB or smaller." };
    if (file.type && !["text/html", "text/plain"].includes(file.type)) {
      return { error: "Prediction snapshot must be an HTML or plain-text file." };
    }
    const content = await file.text();
    return content.trim() ? content : { error: "The uploaded prediction snapshot is empty." };
  }
  if (new TextEncoder().encode(pasted).byteLength > MAX_SNAPSHOT_BYTES) {
    return { error: "Prediction snapshot must be 1 MB or smaller." };
  }
  return pasted;
}

export async function capturePredictionSnapshot(
  _state: PredictionActionState,
  form: FormData,
): Promise<PredictionActionState> {
  const { email } = await requireAdmin();
  const rate = await checkAdminRateLimit({
    adminEmail: email,
    actionKey: "gift_card_prediction_capture",
  });
  if (!rate.success) return { error: rate.error };
  const snapshot = await predictionSnapshot(form);
  if (typeof snapshot !== "string") return snapshot;
  const parsed = parseGcdbPredictions(snapshot, GCDB_PREDICTIONS_URL);
  if (parsed.predictions.length === 0) {
    return { error: "No prediction rows were found in that captured snapshot." };
  }
  try {
    const result = await upsertPredictions(parsed.predictions, {
      sourceUrl: GCDB_PREDICTIONS_URL,
      sourceLastUpdated: parsed.sourceLastUpdated,
    });
    if (!result.available) {
      return { error: "Migration 029 is not available. No prediction records were staged." };
    }
    await logAudit({
      actorEmail: email,
      action: "capture-gift-card-predictions",
      tableName: "gift_card_offer_predictions",
      diff: {
        sourceUrl: GCDB_PREDICTIONS_URL,
        sourceLastUpdated: parsed.sourceLastUpdated,
        parsed: parsed.predictions.length,
        inserted: result.inserted,
        preserved: result.preserved,
        networkFetch: false,
        publicOfferMutated: false,
      },
      forceExplicit: true,
    });
    revalidatePath("/admin/gift-cards/predictions");
    return {
      success: `${result.inserted} private prediction record${result.inserted === 1 ? "" : "s"} staged; ${result.preserved} existing record${result.preserved === 1 ? "" : "s"} preserved.`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not stage predictions." };
  }
}

export async function recordPredictionReview(
  id: string,
  _state: PredictionActionState,
  form: FormData,
): Promise<PredictionActionState> {
  const { email } = await requireAdmin();
  const rate = await checkAdminRateLimit({
    adminEmail: email,
    actionKey: "gift_card_prediction_review",
  });
  if (!rate.success) return { error: rate.error };
  const status = String(form.get("status") ?? "");
  if (!["prediction_matched", "prediction_missed", "prediction_partially_matched"].includes(status)) {
    return { error: "Choose a valid non-publishing prediction outcome." };
  }
  const linkedOfferId = String(form.get("linked_offer_id") ?? "").trim() || null;
  const comparisonNotes = String(form.get("comparison_notes") ?? "").trim() || null;
  if (
    (status === "prediction_matched" ||
      status === "prediction_partially_matched") &&
    !linkedOfferId
  ) {
    return { error: "Matched and partially matched outcomes require a confirmed offer link." };
  }
  if (status === "prediction_missed" && linkedOfferId) {
    return { error: "A missed prediction cannot link a confirmed offer." };
  }
  try {
    await updatePredictionReview(id, {
      status: status as "prediction_matched" | "prediction_missed" | "prediction_partially_matched",
      linkedOfferId,
      comparisonNotes,
    });
    await logAudit({
      actorEmail: email,
      action: "record-gift-card-prediction-outcome",
      tableName: "gift_card_offer_predictions",
      rowId: id,
      diff: { status, linkedOfferId, noteAdded: Boolean(comparisonNotes) },
    });
    revalidatePath("/admin/gift-cards/predictions");
    return { success: "Prediction outcome recorded. No public offer was changed." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update prediction." };
  }
}
