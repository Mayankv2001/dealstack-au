import { deriveConfidence, isExpired } from "./normalise";
import { SOURCE_META, type RankedDealResult } from "./types";

export interface RankingContext {
  /** Store.id the query resolved to, if any */
  queryMerchantId: string | null;
  now: Date;
}

const WEIGHTS = {
  merchantMatch: 0.3,
  confidence: 0.25,
  savings: 0.2,
  trust: 0.15,
  recency: 0.1,
};

const DAY_MS = 24 * 60 * 60 * 1000;

function merchantScore(
  result: RankedDealResult,
  ctx: RankingContext
): number {
  if (!ctx.queryMerchantId) return 0.5; // no store in query — neutral
  if (result.merchantId === ctx.queryMerchantId) return 1;
  if (result.merchantId === null) return 0.4; // program-wide items still relevant
  return 0.1; // a different store
}

function confidenceScore(result: RankedDealResult, now: Date): number {
  switch (deriveConfidence(result, now)) {
    case "confirmed":
      return 1;
    case "needs-verification":
      return 0.55;
    case "expired-unknown":
      return 0;
  }
}

/**
 * Rough "how big is the saving" signal, normalised 0..1.
 * Discounts compare against a 25% ceiling; points offers score on
 * presence/multiplier since they aren't directly comparable to percents.
 */
function savingsScore(result: RankedDealResult): number {
  if (result.discountPercent !== null) {
    return Math.min(result.discountPercent / 25, 1);
  }
  if (result.pointsAmount !== null) {
    const multiplier = result.pointsAmount.match(/(\d+)\s*x/i);
    if (multiplier) return Math.min(Number(multiplier[1]) / 10, 1);
    return 0.5;
  }
  return 0.3;
}

function recencyScore(result: RankedDealResult, now: Date): number {
  const checked = new Date(result.lastCheckedAt).getTime();
  if (Number.isNaN(checked)) return 0;
  const ageDays = Math.max(0, (now.getTime() - checked) / DAY_MS);
  // Half-life: guides and card offers stay relevant for months (bank timelines,
  // not deal timelines); other deals go stale in a week.
  const halfLifeDays = result.kind === "guide" || result.kind === "card" ? 60 : 7;
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
}

/** Corroboration bonus: each extra citing source adds a little trust */
function trustScore(result: RankedDealResult): number {
  const base = SOURCE_META[result.source].trustWeight;
  const corroboration = Math.min((result.citations.length - 1) * 0.1, 0.2);
  return Math.min(base + corroboration, 1);
}

export function scoreResult(
  result: RankedDealResult,
  ctx: RankingContext
): number {
  return (
    WEIGHTS.merchantMatch * merchantScore(result, ctx) +
    WEIGHTS.confidence * confidenceScore(result, ctx.now) +
    WEIGHTS.savings * savingsScore(result) +
    WEIGHTS.trust * trustScore(result) +
    WEIGHTS.recency * recencyScore(result, ctx.now)
  );
}

/**
 * Score and sort: active results first (by score), expired/unknown
 * always last (by score among themselves).
 */
export function rankResults(
  results: RankedDealResult[],
  ctx: RankingContext
): RankedDealResult[] {
  const scored = results.map((r) => ({ ...r, score: scoreResult(r, ctx) }));
  const active = scored.filter((r) => !isExpired(r, ctx.now));
  const expired = scored.filter((r) => isExpired(r, ctx.now));
  const byScore = (a: RankedDealResult, b: RankedDealResult) =>
    b.score - a.score;
  return [...active.sort(byScore), ...expired.sort(byScore)];
}
