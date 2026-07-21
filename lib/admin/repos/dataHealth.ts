import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekMondayAU } from "@/lib/admin/dateHelpers";
import { todayAU } from "@/lib/offers/expiry";

export const REVIEW_INTERVAL_DAYS = {
  cashback: 14,
  giftCards: 30,
  points: 30,
  signals: 14,
} as const;

export interface OfferTypeCounts {
  cashback: number;
  giftCards: number;
  points: number;
  signals: number;
  weeklyDeals: number;
  cardOffers: number;
}

export interface PublishedDataHealth {
  ok: boolean;
  totalOverdue: number;
  overdueByType: OfferTypeCounts;
  /**
   * Expiry-integrity signal: published/approved rows whose expiry_date is
   * strictly before the current Australia/Sydney calendar day. In steady state
   * this is ALWAYS zero — the read boundary hides these immediately and the
   * daily cleanup archives them within a day. A positive count means the
   * scheduled expiry job has silently stopped archiving (missed cron, RPC
   * regression, permissions), which the read filter would otherwise mask. This
   * is the direct detector for a stale/failed expiry job, independent of the
   * pipeline run ledger.
   */
  expiredStillPublished: OfferTypeCounts;
  totalExpiredStillPublished: number;
  checkedAt: string;
}

function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

/**
 * Pure health verdict from the two count maps. Extracted so the alerting rule
 * (any overdue review OR any published-but-expired row → not ok) is unit-tested
 * without a database. A published-but-expired row is the stronger signal: it
 * means the archival job has stopped even though the read filter still hides it.
 */
export function summarisePublishedDataHealth(
  overdueByType: OfferTypeCounts,
  expiredStillPublished: OfferTypeCounts,
  checkedAt: string,
): PublishedDataHealth {
  const totalOverdue = Object.values(overdueByType).reduce(
    (sum, value) => sum + value,
    0,
  );
  const totalExpiredStillPublished = Object.values(expiredStillPublished).reduce(
    (sum, value) => sum + value,
    0,
  );
  return {
    ok: totalOverdue === 0 && totalExpiredStillPublished === 0,
    totalOverdue,
    overdueByType,
    expiredStillPublished,
    totalExpiredStillPublished,
    checkedAt,
  };
}

/** Counts only. No offer names, URLs, queries or personal data leave the route. */
export async function getPublishedDataHealth(
  now: Date = new Date()
): Promise<PublishedDataHealth> {
  const db = getSupabaseAdmin();
  // Australia/Sydney calendar date — the single expiry boundary used by every
  // read path (lib/offers/expiry.ts) and the daily cleanup RPC. An offer is
  // "expired" only once today has moved strictly past its expiry_date, so this
  // check uses the same `expiry_date < today` (i.e. `lt`) semantics.
  const today = todayAU(now);

  const count = async (
    query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
    label: string
  ): Promise<number> => {
    const result = await query;
    if (result.error) throw new Error(`${label} health read failed: ${result.error.message}`);
    return result.count ?? 0;
  };

  const [
    cashback,
    giftCards,
    points,
    signals,
    weeklyDeals,
    cardOffers,
    cashbackExpired,
    giftCardsExpired,
    pointsExpired,
    signalsExpired,
    weeklyDealsExpired,
    cardOffersExpired,
  ] = await Promise.all([
    // ── Overdue reviews (stale last_checked_at) ─────────────────────────────
    count(
      db.from("cashback_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .lt("last_checked_at", cutoffIso(now, REVIEW_INTERVAL_DAYS.cashback)),
      "cashback"
    ),
    count(
      db.from("gift_card_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .lt("last_checked_at", cutoffIso(now, REVIEW_INTERVAL_DAYS.giftCards)),
      "gift cards"
    ),
    count(
      db.from("points_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .lt("last_checked_at", cutoffIso(now, REVIEW_INTERVAL_DAYS.points)),
      "points"
    ),
    count(
      db.from("ozbargain_signals").select("*", { count: "exact", head: true })
        .eq("status", "approved")
        .lt("last_checked_at", cutoffIso(now, REVIEW_INTERVAL_DAYS.signals)),
      "signals"
    ),
    count(
      db.from("weekly_deals").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .lt("week_of", weekMondayAU(now)),
      "weekly deals"
    ),
    count(
      db.from("card_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .eq("is_archived", false)
        .lt("review_by_date", today),
      "card offers"
    ),
    // ── Expiry integrity: published but past the Sydney expiry day ──────────
    count(
      db.from("cashback_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "cashback expiry"
    ),
    count(
      db.from("gift_card_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "gift card expiry"
    ),
    count(
      db.from("points_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "points expiry"
    ),
    count(
      db.from("ozbargain_signals").select("*", { count: "exact", head: true })
        .eq("status", "approved")
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "signals expiry"
    ),
    count(
      db.from("weekly_deals").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "weekly deals expiry"
    ),
    count(
      db.from("card_offers").select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .eq("is_archived", false)
        .not("expiry_date", "is", null)
        .lt("expiry_date", today),
      "card offers expiry"
    ),
  ]);

  return summarisePublishedDataHealth(
    { cashback, giftCards, points, signals, weeklyDeals, cardOffers },
    {
      cashback: cashbackExpired,
      giftCards: giftCardsExpired,
      points: pointsExpired,
      signals: signalsExpired,
      weeklyDeals: weeklyDealsExpired,
      cardOffers: cardOffersExpired,
    },
    now.toISOString(),
  );
}
