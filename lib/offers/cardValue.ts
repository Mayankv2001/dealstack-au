import type { CardOffer } from "@/lib/offers/types";

export interface FirstYearValueEstimate {
  firstYearPoints: number;
  pointsValue: number | null;
  cashBenefits: number;
  annualFee: number;
  netValue: number | null;
}

/**
 * Editorial comparison estimate, never an approval recommendation.
 * Points are valued only when an explicit per-row assumption exists, and
 * post-year-one stages are deliberately excluded.
 */
export function estimateFirstYearValue(
  offer: CardOffer
): FirstYearValueEstimate {
  const firstYearPoints =
    offer.bonusStages.length > 0
      ? offer.bonusStages
          .filter((stage) => stage.withinFirstYear)
          .reduce((sum, stage) => sum + stage.points, 0)
      : (offer.bonusPoints ?? 0);
  const pointsValue =
    firstYearPoints > 0 && offer.pointValueCents != null
      ? (firstYearPoints * offer.pointValueCents) / 100
      : firstYearPoints === 0
        ? 0
        : null;
  const cashBenefits =
    (offer.cashbackAmount ?? 0) + (offer.statementCreditAmount ?? 0);
  const annualFee = offer.annualFee ?? 0;
  const netValue =
    pointsValue == null ? null : pointsValue + cashBenefits - annualFee;

  return { firstYearPoints, pointsValue, cashBenefits, annualFee, netValue };
}

