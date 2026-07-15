import type { GiftCardAcceptanceRow } from "@/lib/offers/types";
import type { PublicGiftCardOccurrence } from "@/lib/repos/giftCardIntelligence";
import {
  ACCEPTANCE_CHANGED_WARNING,
  acceptanceChangedSince,
} from "./reconcileAcceptance";

export const EXPIRED_SAVED_PLAN_WARNING =
  "This saved plan uses an offer that has expired.";

export interface SavedPlanHistoryContext {
  offerId?: string | null;
  acceptanceId?: string | null;
  planCreatedAt?: string | null;
}

/** Pure public warning model for links from saved or shared purchase plans. */
export function savedPlanHistoryWarnings(
  context: SavedPlanHistoryContext,
  occurrences: readonly PublicGiftCardOccurrence[],
  acceptance: readonly GiftCardAcceptanceRow[],
): string[] {
  const warnings: string[] = [];
  if (
    context.offerId &&
    occurrences.some((row) => row.sourceOfferId === context.offerId)
  ) {
    warnings.push(EXPIRED_SAVED_PLAN_WARNING);
  }
  if (context.acceptanceId && context.planCreatedAt) {
    const row = acceptance.find((item) => item.id === context.acceptanceId);
    if (row && acceptanceChangedSince(row, context.planCreatedAt)) {
      warnings.push(ACCEPTANCE_CHANGED_WARNING);
    }
  }
  return warnings;
}
