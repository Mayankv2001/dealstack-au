import { isExpiringSoonAU } from "@/lib/offers/expiry";
import type { PublicDeal } from "@/lib/deals/types";

/**
 * Front-page highlight selections over the normalised PublicDeal pool — the
 * same vocabulary /deals queries, so the homepage can never disagree with the
 * deals page about what an offer is called or when it ends.
 *
 * PURE and clock-injected, like every other selection in lib/deals.
 */

/** Offers with a confirmed end date inside the next week, ending soonest. */
export function endingSoonDeals(
  deals: readonly PublicDeal[],
  now: Date,
  limit = 3,
): PublicDeal[] {
  return deals
    .filter(
      (deal) =>
        deal.dateStatus !== "expired" &&
        isExpiringSoonAU(deal.expiryDate, now),
    )
    .sort(
      (a, b) =>
        (a.expiryDate ?? "").localeCompare(b.expiryDate ?? "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}

/** Most recently re-checked live offers — the review trail, newest first. */
export function latestReviewedDeals(
  deals: readonly PublicDeal[],
  limit = 7,
): PublicDeal[] {
  return deals
    .filter((deal) => deal.dateStatus !== "expired" && deal.lastCheckedAt)
    .sort(
      (a, b) =>
        (b.lastCheckedAt ?? "").localeCompare(a.lastCheckedAt ?? "") ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit);
}
