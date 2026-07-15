/**
 * Prediction ⇄ confirmed-offer reconciliation (TASK-04, consumed by TASK-05/06).
 *
 * Pure and read-only over confirmed offers. It NEVER inserts a prediction into
 * an offer path — it only computes an outcome and, on a match, the id of the
 * confirmed offer to LINK (the prediction row itself is never overwritten;
 * TASK-06's repo updates outcome fields + linked_offer_id only). Predictions
 * remain strictly isolated (029 RLS default-deny); this module returns data, it
 * does not publish anything.
 */

import { todayAU } from "@/lib/offers/expiry";

export type PredictionOutcome =
  | "exact-match"
  | "partial-match"
  | "different-value"
  | "different-family"
  | "different-seller"
  | "different-dates"
  | "no-promotion"
  | "did-not-occur"
  | "pending";

export interface PredictionInput {
  id: string;
  predictedSeller: string | null;
  predictedFamilies: string[];
  predictedPromotionType: string | null;
  /** Normalised comparable value string (e.g. "10%", "20x"); null = unknown. */
  predictedValue: string | null;
  predictedStartsAt: string | null;
  predictedEndsAt: string | null;
}

export interface ConfirmedOfferInput {
  id: string;
  seller: string | null;
  families: string[];
  promotionType: string | null;
  value: string | null;
  startDate: string | null;
  expiryDate: string | null;
}

export interface PredictionReconcileResult {
  predictionId: string;
  outcome: PredictionOutcome;
  linkedOfferId: string | null;
  detail?: string;
}

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();
const familyOverlap = (a: string[], b: string[]): boolean => {
  const set = new Set(a.map(norm).filter(Boolean));
  return b.map(norm).some((x) => x && set.has(x));
};
const datesOverlap = (p: PredictionInput, o: ConfirmedOfferInput): boolean => {
  // Loose overlap: if either side lacks dates, don't treat as a date mismatch.
  if (!p.predictedStartsAt && !p.predictedEndsAt) return true;
  if (!o.startDate && !o.expiryDate) return true;
  const pStart = p.predictedStartsAt ?? "0000-00-00";
  const pEnd = p.predictedEndsAt ?? "9999-99-99";
  const oStart = o.startDate ?? "0000-00-00";
  const oEnd = o.expiryDate ?? "9999-99-99";
  return pStart <= oEnd && oStart <= pEnd;
};

function scoreMatch(
  p: PredictionInput,
  o: ConfirmedOfferInput
): { outcome: PredictionOutcome; strength: number } {
  const sellerSame = norm(p.predictedSeller) !== "" && norm(p.predictedSeller) === norm(o.seller);
  const famSame = familyOverlap(p.predictedFamilies, o.families);
  if (!sellerSame && !famSame) return { outcome: "did-not-occur", strength: 0 };

  // A confirmed listing with neither a promotion type nor a value is "no-promotion".
  if (sellerSame && famSame && !o.promotionType && !o.value) {
    return { outcome: "no-promotion", strength: 5 };
  }
  if (sellerSame && !famSame) return { outcome: "different-family", strength: 2 };
  if (!sellerSame && famSame) return { outcome: "different-seller", strength: 2 };
  // seller + family match beyond here.
  if (!datesOverlap(p, o)) return { outcome: "different-dates", strength: 3 };
  const typeSame =
    norm(p.predictedPromotionType) !== "" &&
    norm(p.predictedPromotionType) === norm(o.promotionType);
  const typeMismatch = Boolean(
    norm(p.predictedPromotionType) &&
    norm(o.promotionType) &&
    !typeSame,
  );
  const valueSame = norm(p.predictedValue) !== "" && norm(p.predictedValue) === norm(o.value);
  if (p.predictedValue && o.value && !valueSame) {
    return { outcome: "different-value", strength: 4 };
  }
  if (valueSame && !typeMismatch) return { outcome: "exact-match", strength: 6 };
  return { outcome: "partial-match", strength: 5 };
}

export function reconcilePredictions(
  predictions: readonly PredictionInput[],
  confirmedOffers: readonly ConfirmedOfferInput[],
  now: Date = new Date()
): PredictionReconcileResult[] {
  const today = todayAU(now);
  return predictions.map((p) => {
    let best: { outcome: PredictionOutcome; strength: number; offerId: string } | null = null;
    for (const o of confirmedOffers) {
      const s = scoreMatch(p, o);
      if (s.strength > 0 && (!best || s.strength > best.strength)) {
        best = { ...s, offerId: o.id };
      }
    }

    if (!best) {
      // No candidate at all. If the predicted window has ended, it did not
      // occur; otherwise it is still pending.
      const ended = (p.predictedEndsAt ?? "9999-99-99") < today;
      return {
        predictionId: p.id,
        outcome: ended ? "did-not-occur" : "pending",
        linkedOfferId: null,
      };
    }

    // Link only on a genuine match (seller+family agreement at minimum).
    const linkable = best.outcome === "exact-match" || best.outcome === "partial-match" || best.outcome === "different-value" || best.outcome === "different-dates";
    return {
      predictionId: p.id,
      outcome: best.outcome,
      linkedOfferId: linkable ? best.offerId : null,
    };
  });
}
