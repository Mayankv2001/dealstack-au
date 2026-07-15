/**
 * Reconciliation data boundary (TASK-05) — service-role only.
 *
 * Supplies the reconcile orchestrator (lib/giftcards/runReconcile.ts) with its
 * inputs and its apply callbacks. It NEVER fetches from a source: it reads only
 * already-stored, admin-reviewed state. Approved candidates provide the
 * reviewed baseline and bounded raw-item extractions provide the newest stored
 * snapshot. Acceptance reconciliation reads reviewed public facts plus private
 * captured candidates; stale facts can stage a private recheck without enabling
 * any external fetch.
 *
 * Apply callbacks route material changes to the EXISTING review queue
 * (stageCandidate) — never to a public table — preserving the admin-approval
 * boundary. Non-material refresh and source-unavailable flagging are recorded
 * against stored raw items; expiry is handed to the lifecycle/archive path
 * (TASK-03). No callback publishes anything.
 */

import type { ReconcileItem, ReconcileResult } from "@/lib/giftcards/reconcileOffers";
import type {
  ConfirmedOfferInput,
  PredictionInput,
  PredictionReconcileResult,
} from "@/lib/giftcards/reconcilePredictions";
import type { AcceptanceReconciliationResult } from "@/lib/giftcards/reconcileAcceptance";
import type { AcceptanceCandidateDraft } from "@/lib/giftcards/parseMerchantList";
import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import {
  acceptanceCandidateToDraft,
  listAcceptanceCandidates,
  stageStaleAcceptanceRecheck,
} from "@/lib/admin/repos/giftCardAcceptance";
import {
  listPredictions,
  recordPredictionReconcileOutcome,
} from "@/lib/admin/repos/giftCardPredictions";
import {
  confirmStoredOfferRefresh,
  loadConfirmedOffersForPredictionReconcile,
  loadStoredOfferReconcileRecords,
  recordGiftCardReconcileAudit,
  stageStoredOfferReconcileResult,
  type StoredOfferReconcileRecord,
} from "@/lib/admin/repos/giftCardReconcileStore";
import { getAllGiftCardAcceptance } from "@/lib/repos/giftCardProducts";

export interface ReconcileApplyCallbacks {
  stageChanged(result: ReconcileResult): Promise<void>;
  refresh(result: ReconcileResult): Promise<void>;
  markSourceUnavailable(result: ReconcileResult): Promise<void>;
  handleExpired(result: ReconcileResult): Promise<void>;
  recordPredictionOutcome(outcome: PredictionReconcileResult): Promise<void>;
  recordAcceptanceOutcome(outcome: AcceptanceReconciliationResult): Promise<void>;
}

export interface ReconcileInputs {
  items: ReconcileItem[];
  predictionInputs: {
    predictions: PredictionInput[];
    confirmedOffers: ConfirmedOfferInput[];
  };
  acceptanceInputs: {
    current: GiftCardAcceptanceRow[];
    candidates: AcceptanceCandidateDraft[];
  };
  apply: ReconcileApplyCallbacks;
}

export interface ReconcileDataBoundaries {
  /** One captured clock for classification and every persistence callback. */
  now?: Date;
  /** TASK-03/TASK-19 lifecycle adapter. It is the only allowed confirmed-expiry
   * handoff; absence fails closed and never stages removal/unpublishes here. */
  archiveConfirmedExpired?: (
    record: StoredOfferReconcileRecord,
    result: ReconcileResult,
    now: Date,
  ) => Promise<void>;
}

/**
 * Build the reconcile inputs from stored state only. Optional intelligence
 * schemas degrade to empty inputs; missing canonical lifecycle state fails with
 * the controlled schema-unavailable error because archived rows cannot be
 * distinguished safely. Every non-lifecycle mutation remains private until a
 * separate authenticated admin approval.
 */
export async function loadReconcileInputs(
  boundaries: ReconcileDataBoundaries = {},
): Promise<ReconcileInputs> {
  const capturedNow = boundaries.now ?? new Date();
  const [
    offerLoad,
    predictionLoad,
    confirmedOffers,
    currentAcceptance,
    pendingAcceptance,
  ] = await Promise.all([
    loadStoredOfferReconcileRecords(),
    listPredictions(),
    loadConfirmedOffersForPredictionReconcile(),
    getAllGiftCardAcceptance(),
    listAcceptanceCandidates(),
  ]);
  const acceptanceCandidates = pendingAcceptance.flatMap((candidate) => {
    const draft = acceptanceCandidateToDraft(candidate);
    return draft ? [draft] : [];
  });
  const currentAcceptanceById = new Map(
    currentAcceptance.map((row) => [row.id, row]),
  );
  const recordsByOfferId = new Map<string, StoredOfferReconcileRecord>();
  const newRecords: StoredOfferReconcileRecord[] = [];
  for (const record of offerLoad.records) {
    if (record.item.offerId) recordsByOfferId.set(record.item.offerId, record);
    else newRecords.push(record);
  }
  let nextNewRecord = 0;
  const resolveRecord = (result: ReconcileResult): StoredOfferReconcileRecord => {
    const record = result.offerId
      ? recordsByOfferId.get(result.offerId)
      : newRecords[nextNewRecord++];
    if (!record) {
      throw new Error(
        `Stored reconciliation context is missing for ${result.offerId ?? "new offer"}.`,
      );
    }
    return record;
  };

  return {
    items: offerLoad.records.map((record) => record.item),
    predictionInputs: {
      predictions: predictionLoad.available
        ? predictionLoad.rows
            .filter((row) => row.status === "predicted")
            .map((row) => ({
              id: row.id,
              predictedSeller: row.predictedSeller,
              predictedFamilies: row.predictedFamilies,
              predictedPromotionType: row.predictedPromotionType,
              predictedValue: row.predictedValue,
              predictedStartsAt: row.predictedStartsAt,
              predictedEndsAt: row.predictedEndsAt,
            }))
        : [],
      confirmedOffers: predictionLoad.available ? confirmedOffers : [],
    },
    acceptanceInputs: {
      current: currentAcceptance,
      candidates: acceptanceCandidates,
    },
    apply: {
      // Material / new / withdrawn → a private reviewable candidate only.
      async stageChanged(result) {
        await stageStoredOfferReconcileResult(
          resolveRecord(result),
          result,
          capturedNow,
        );
      },
      async refresh(result) {
        await confirmStoredOfferRefresh(resolveRecord(result));
      },
      async markSourceUnavailable(result) {
        await stageStoredOfferReconcileResult(
          resolveRecord(result),
          result,
          capturedNow,
        );
      },
      async handleExpired(result) {
        const record = resolveRecord(result);
        if (!boundaries.archiveConfirmedExpired) {
          throw new Error(
            "Confirmed-expiry lifecycle boundary is unavailable; no offer was changed.",
          );
        }
        await boundaries.archiveConfirmedExpired(record, result, capturedNow);
      },
      async recordPredictionOutcome(outcome) {
        await recordPredictionReconcileOutcome(outcome, capturedNow);
      },
      async recordAcceptanceOutcome(outcome) {
        // Captured additions/changes/removals are already private candidates.
        // A stale canonical row has no candidate, so stage one recheck exactly
        // once rather than mutating or hiding the public fact silently.
        if (!outcome.outcomes.includes("became-stale") || !outcome.currentId) {
          return;
        }
        const current = currentAcceptanceById.get(outcome.currentId);
        if (!current) return;
        const staged = await stageStaleAcceptanceRecheck(current);
        if (staged) {
          await recordGiftCardReconcileAudit({
            action: "gift-card-acceptance-stale-recheck",
            tableName: "gift_card_acceptance_candidates",
            rowId: current.id,
            diff: {
              productId: current.productId,
              currentAcceptanceId: current.id,
              reconciledAt: capturedNow.toISOString(),
              publicAcceptanceMutated: false,
            },
          });
        }
      },
    },
  };
}
