import { filterLive } from "@/lib/offers/expiry";
import { weeklyDeals as staticWeeklyDeals } from "@/lib/offers/manualOffers";
import type { WeeklyDeal, WeeklyHighlight } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";
import { fromDbOrStatic, type DbClient } from "@/lib/supabase/server";

/**
 * Weekly deals repository. Supabase when configured (published only), otherwise
 * the static `weeklyDeals` array. Rows mapped back to the `WeeklyDeal` shape.
 */

interface WeeklyDealRow {
  id: string;
  week_of: string;
  merchant_id: string | null;
  title: string;
  summary: string;
  highlight: WeeklyHighlight;
  component_ids: string[];
  citations: Citation[];
  expiry_date: string | null;
  confidence: Confidence;
}

function mapWeeklyDeal(r: WeeklyDealRow): WeeklyDeal {
  return {
    id: r.id,
    weekOf: r.week_of,
    merchantId: r.merchant_id,
    title: r.title,
    summary: r.summary,
    highlight: r.highlight,
    componentIds: r.component_ids ?? [],
    citations: r.citations ?? [],
    expiryDate: r.expiry_date,
    confidence: r.confidence,
  };
}

export async function getWeeklyDeals(): Promise<WeeklyDeal[]> {
  // filterLive wraps the fallback result so expired rows can't trigger the
  // zero-rows static fallback, and static rows are themselves guarded.
  const rows = await fromDbOrStatic("weekly_deals", staticWeeklyDeals, async (db: DbClient) => {
    const { data, error } = await db
      .from("weekly_deals")
      .select("*")
      .order("week_of", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as WeeklyDealRow[]).map(mapWeeklyDeal);
  });
  return filterLive(rows);
}
