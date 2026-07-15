/**
 * Reconciliation run orchestrator (TASK-05) — dependency-injected, testable.
 *
 * Loads the canonical-offer ⇄ latest-source state via injected deps, runs the
 * pure TASK-04 engine, and APPLIES each outcome through injected repo calls:
 *   - material      → stage a reviewable "changed" candidate (never publish),
 *   - non-material  → refresh last-seen/etag only,
 *   - source-missing→ set source_present=false intent + review flag (no expiry),
 *   - expired       → hand to the archive path,
 *   - prediction    → record outcome + link (prediction row never overwritten).
 *
 * Step isolation: one failing apply is captured and does not abort the others
 * (mirrors runGuarded's "observability never blocks finalisation" rule). It
 * never fetches from a closed source. An intentionally disabled source
 * contributes no offer items at all; `source-unavailable` is reserved for a
 * permitted attempted retrieval whose stored reconciliation input explicitly
 * represents temporary unavailability.
 */

import {
  flagPossibleDuplicates,
  reconcileOffers,
  type ReconcileDuplicateAdvisory,
  type ReconcileItem,
  type ReconcileResult,
} from "@/lib/giftcards/reconcileOffers";
import {
  reconcilePredictions,
  type ConfirmedOfferInput,
  type PredictionInput,
  type PredictionReconcileResult,
} from "@/lib/giftcards/reconcilePredictions";
import {
  reconcileAcceptance,
  type AcceptanceReconciliationResult,
} from "@/lib/giftcards/reconcileAcceptance";
import type { AcceptanceCandidateDraft } from "@/lib/giftcards/parseMerchantList";
import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import type {
  DedupCandidate,
  PublishedOfferSummary,
} from "@/lib/giftcards/duplicateDetection";

export interface ReconcileDeps {
  now(): Date;
  /** Canonical offers paired with their latest parsed source item, per offer. */
  loadItems(): Promise<ReconcileItem[]>;
  /** Predictions + confirmed offers for the prediction comparison pass. */
  loadPredictionInputs(): Promise<{
    predictions: PredictionInput[];
    confirmedOffers: ConfirmedOfferInput[];
  }>;
  /** Stage a reviewable changed candidate for a material outcome. */
  stageChanged(result: ReconcileResult): Promise<void>;
  /** Refresh last-seen/etag for a non-material (auto) outcome. */
  refresh(result: ReconcileResult): Promise<void>;
  /** Flag source_present=false intent for a source-unavailable outcome. */
  markSourceUnavailable(result: ReconcileResult): Promise<void>;
  /** Hand a confirmed-expired offer to the archive path (TASK-03). */
  handleExpired(result: ReconcileResult): Promise<void>;
  /** Record a prediction outcome + linked_offer_id (row never overwritten). */
  recordPredictionOutcome(outcome: PredictionReconcileResult): Promise<void>;
  loadAcceptanceInputs(): Promise<{
    current: GiftCardAcceptanceRow[];
    candidates: AcceptanceCandidateDraft[];
  }>;
  recordAcceptanceOutcome(outcome: AcceptanceReconciliationResult): Promise<void>;
  /** Optional advisory-only duplicate pass; it never rejects or publishes. */
  loadDuplicateInputs?(): Promise<{
    newCandidates: { id: string; candidate: DedupCandidate }[];
    published: PublishedOfferSummary[];
  }>;
  recordDuplicateAdvisory?(advisory: ReconcileDuplicateAdvisory): Promise<void>;
}

export interface ReconcileMetrics {
  total: number;
  changed: number;
  refreshed: number;
  newOffers: number;
  withdrawn: number;
  sourceUnavailable: number;
  expired: number;
  parseFailures: number;
  acceptanceHints: number;
  possibleDuplicates: number;
  predictionsProcessed: number;
  predictionsMatched: number;
  acceptanceProcessed: number;
  acceptanceChanged: number;
  acceptanceStale: number;
  errors: string[];
  status: "ok" | "partial" | "error";
}

async function safeApply(
  errors: string[],
  label: string,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function runGiftCardReconcile(
  deps: ReconcileDeps
): Promise<ReconcileMetrics> {
  const now = deps.now();
  const errors: string[] = [];

  const items = await deps.loadItems();
  const { results } = reconcileOffers(items, now);

  const metrics: ReconcileMetrics = {
    total: results.length,
    changed: 0,
    refreshed: 0,
    newOffers: 0,
    withdrawn: 0,
    sourceUnavailable: 0,
    expired: 0,
    parseFailures: 0,
    acceptanceHints: 0,
    possibleDuplicates: 0,
    predictionsProcessed: 0,
    predictionsMatched: 0,
    acceptanceProcessed: 0,
    acceptanceChanged: 0,
    acceptanceStale: 0,
    errors,
    status: "ok",
  };

  for (const result of results) {
    switch (result.outcome) {
      case "unchanged":
        if (result.autoRefresh) {
          metrics.refreshed++;
          await safeApply(errors, `refresh ${result.offerId}`, () => deps.refresh(result));
        }
        break;
      case "new-offer":
        metrics.newOffers++;
        await safeApply(errors, `stage-new ${result.offerId}`, () => deps.stageChanged(result));
        break;
      case "withdrawn":
        metrics.withdrawn++;
        await safeApply(errors, `stage-withdrawn ${result.offerId}`, () => deps.stageChanged(result));
        break;
      case "source-unavailable":
        metrics.sourceUnavailable++;
        await safeApply(errors, `unavailable ${result.offerId}`, () => deps.markSourceUnavailable(result));
        break;
      case "expired":
        metrics.expired++;
        await safeApply(errors, `expire ${result.offerId}`, () => deps.handleExpired(result));
        break;
      case "parse-failure":
        metrics.parseFailures++;
        break;
      case "acceptance-change-hint":
        metrics.acceptanceHints++;
        break;
      default:
        // Every other material outcome → a reviewable changed candidate.
        if (result.requiresReview) {
          metrics.changed++;
          await safeApply(errors, `stage-changed ${result.offerId}`, () => deps.stageChanged(result));
        }
        break;
    }
  }

  // Duplicate detection is advisory and independent from candidate staging.
  // Existing callers may omit it; when supplied, the metric counts candidate
  // drafts flagged (not the number of matching published rows).
  if (deps.loadDuplicateInputs) {
    try {
      const { newCandidates, published } = await deps.loadDuplicateInputs();
      const advisories = flagPossibleDuplicates(newCandidates, published, now);
      metrics.possibleDuplicates = advisories.length;
      if (deps.recordDuplicateAdvisory) {
        for (const advisory of advisories) {
          await safeApply(errors, `possible-duplicate ${advisory.id}`, () =>
            deps.recordDuplicateAdvisory!(advisory),
          );
        }
      }
    } catch (err) {
      errors.push(`duplicates: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Prediction comparison (isolated: reads confirmed offers, records outcomes).
  try {
    const { predictions, confirmedOffers } = await deps.loadPredictionInputs();
    const outcomes = reconcilePredictions(predictions, confirmedOffers, now);
    metrics.predictionsProcessed = outcomes.length;
    metrics.predictionsMatched = outcomes.filter((o) => o.linkedOfferId != null).length;
    for (const outcome of outcomes) {
      await safeApply(errors, `prediction ${outcome.predictionId}`, () =>
        deps.recordPredictionOutcome(outcome)
      );
    }
  } catch (err) {
    errors.push(`predictions: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Acceptance is an independent ordered step. A schema/source failure is
  // isolated from offer and prediction reconciliation and reports partial.
  try {
    const { current, candidates } = await deps.loadAcceptanceInputs();
    const outcomes = reconcileAcceptance(current, candidates, now);
    metrics.acceptanceProcessed = outcomes.length;
    metrics.acceptanceChanged = outcomes.filter(
      (outcome) => !outcome.outcomes.includes("unchanged"),
    ).length;
    metrics.acceptanceStale = outcomes.filter((outcome) =>
      outcome.outcomes.includes("became-stale"),
    ).length;
    for (const outcome of outcomes) {
      if (outcome.outcomes.includes("unchanged")) continue;
      await safeApply(errors, `acceptance ${outcome.currentId ?? "new"}`, () =>
        deps.recordAcceptanceOutcome(outcome),
      );
    }
  } catch (err) {
    errors.push(`acceptance: ${err instanceof Error ? err.message : String(err)}`);
  }

  metrics.status = errors.length === 0 ? "ok" : "partial";
  return metrics;
}
