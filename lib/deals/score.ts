import { daysUntilExpiryAU } from "@/lib/offers/expiry";
import type { PublicDeal, TrustStatus } from "./types";

/**
 * Recommended-sort scoring — pure, deterministic, unit-tested.
 *
 * A weighted blend of the ranking inputs the product cares about: freshness,
 * verification confidence, saving size, stackability, source quality signals
 * (votes/comments), expiry urgency and data completeness. Expired records are
 * handled upstream (excluded by default), so this only ranks live deals.
 */

const TRUST_POINTS: Record<TrustStatus, number> = {
  verified: 18,
  "source-checked": 10,
  community: 4,
  expired: -40,
};

/** Whole days since an ISO timestamp/date, or null when absent/invalid. */
export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

function freshnessPoints(deal: Pick<PublicDeal, "postedAt" | "lastCheckedAt">, now: Date): number {
  const age = daysSince(deal.postedAt ?? deal.lastCheckedAt, now);
  if (age == null) return 0;
  if (age <= 1) return 16;
  if (age <= 3) return 12;
  if (age <= 7) return 8;
  if (age <= 14) return 4;
  if (age > 30) return -8;
  return 0;
}

function savingPoints(savingPercent: number | null, priceValue: number | null): number {
  let points = priceValue != null ? 2 : 0;
  if (savingPercent == null) return points;
  if (savingPercent >= 50) points += 10;
  else if (savingPercent >= 25) points += 7;
  else if (savingPercent >= 10) points += 4;
  else if (savingPercent > 0) points += 2;
  return points;
}

function urgencyPoints(expiryDate: string | null, now: Date): number {
  const days = daysUntilExpiryAU(expiryDate, now);
  if (days == null || days < 0) return 0;
  if (days === 0) return 8;
  if (days <= 7) return 6;
  return 0;
}

/** Score one deal for the Recommended sort. Higher is better; roughly 0–100. */
export function scoreDeal(
  deal: Omit<PublicDeal, "score" | "searchText">,
  now: Date
): number {
  let score = 40;
  score += TRUST_POINTS[deal.trust];
  score += freshnessPoints(deal, now);
  score += savingPoints(deal.savingPercent, deal.priceValue);
  score += urgencyPoints(deal.expiryDate, now);
  if (deal.stackable) score += 8;
  if (deal.couponCode) score += 2;
  if ((deal.votes ?? 0) >= 20) score += 3;
  if (deal.merchantId) score += 3;
  return Math.max(0, Math.min(100, score));
}
