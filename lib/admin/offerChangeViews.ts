import type { AdminOfferChange } from "@/lib/admin/repos/offerChanges";
import {
  isApplyPlan,
  isCardApplyPlan,
  planOfferApplication,
  type ApplyPlan,
} from "@/lib/monitor/offerChanges";

export interface OfferChangeView extends AdminOfferChange {
  canApply: boolean;
  applyHint: string;
}

const TABLE_LABELS: Record<string, string> = {
  cashback_offers: "cashback rate",
  gift_card_offers: "gift-card discount",
  points_offers: "points rate",
  stores: "promo discount",
};

function humanApplyHint(plan: ApplyPlan): string {
  if (isCardApplyPlan(plan)) {
    const fields = Object.entries(plan.changes)
      .map(([field, value]) => `${field.replaceAll("_", " ")} to ${value}`)
      .join(" and ");
    return `Will update card offer ${fields}; publication state is unchanged`;
  }
  const isPercent = ["rate_percent", "discount_percent"].includes(plan.column);
  const formatted = isPercent ? `${plan.value}%` : String(plan.value);
  const label = TABLE_LABELS[plan.table] ?? plan.table;
  return `Will update ${label} to ${formatted} - confirm before applying`;
}

export function buildOfferChangeViews(
  candidates: AdminOfferChange[]
): OfferChangeView[] {
  return candidates.map((candidate) => {
    const plan = planOfferApplication({
      sourceType: candidate.sourceType,
      reviewState: candidate.reviewState,
      targetId: candidate.targetId,
      proposedValue: candidate.proposedValue,
      payload: candidate.payload,
    });
    return {
      ...candidate,
      canApply: isApplyPlan(plan),
      applyHint: isApplyPlan(plan) ? humanApplyHint(plan) : plan.skip,
    };
  });
}
