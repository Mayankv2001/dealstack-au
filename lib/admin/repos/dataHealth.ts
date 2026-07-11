import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { weekMondayAU } from "@/lib/admin/dateHelpers";

export const REVIEW_INTERVAL_DAYS = {
  cashback: 14,
  giftCards: 30,
  points: 30,
  signals: 14,
} as const;

export interface PublishedDataHealth {
  ok: boolean;
  totalOverdue: number;
  overdueByType: {
    cashback: number;
    giftCards: number;
    points: number;
    signals: number;
    weeklyDeals: number;
    cardOffers: number;
  };
  checkedAt: string;
}

function cutoffIso(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

const AU_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Melbourne",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Counts only. No offer names, URLs, queries or personal data leave the route. */
export async function getPublishedDataHealth(
  now: Date = new Date()
): Promise<PublishedDataHealth> {
  const db = getSupabaseAdmin();
  const count = async (
    query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
    label: string
  ): Promise<number> => {
    const result = await query;
    if (result.error) throw new Error(`${label} health read failed: ${result.error.message}`);
    return result.count ?? 0;
  };

  const [cashback, giftCards, points, signals, weeklyDeals, cardOffers] =
    await Promise.all([
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
          .lt("review_by_date", AU_DAY.format(now)),
        "card offers"
      ),
    ]);

  const overdueByType = {
    cashback,
    giftCards,
    points,
    signals,
    weeklyDeals,
    cardOffers,
  };
  const totalOverdue = Object.values(overdueByType).reduce(
    (sum, value) => sum + value,
    0
  );
  return {
    ok: totalOverdue === 0,
    totalOverdue,
    overdueByType,
    checkedAt: now.toISOString(),
  };
}

