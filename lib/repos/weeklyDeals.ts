import { filterLive } from "@/lib/offers/expiry";
import { weeklyDeals as staticWeeklyDeals } from "@/lib/offers/manualOffers";
import type { WeeklyDeal, WeeklyHighlight } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";
import { fromDbOrDemo, type DbClient } from "@/lib/supabase/server";

/**
 * Weekly deals repository. Supabase is authoritative when configured; the
 * static array is only for explicit demo mode or an unconfigured environment.
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
  const rows = await fromDbOrDemo(
    "weekly_deals",
    staticWeeklyDeals,
    async (db: DbClient) => {
      const { data, error } = await db
        .from("weekly_deals")
        .select("*")
        .order("week_of", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as WeeklyDealRow[]).map(mapWeeklyDeal);
    }
  );
  return filterLive(rows);
}

/**
 * One deal by id, for the /deals/[slug] detail page. Deliberately NOT
 * filtered by expiry: a permalinked deal that has ended should render an
 * explicit expired state (and keep its inbound links working) rather than
 * 404. Missing id → null.
 */
export async function getWeeklyDealById(
  id: string
): Promise<WeeklyDeal | null> {
  const rows = await fromDbOrDemo(
    "weekly_deals",
    staticWeeklyDeals,
    async (db: DbClient) => {
      const { data, error } = await db
        .from("weekly_deals")
        .select("*")
        .eq("id", id)
        .limit(1);
      if (error) throw error;
      return ((data ?? []) as unknown as WeeklyDealRow[]).map(mapWeeklyDeal);
    }
  );
  return rows.find((deal) => deal.id === id) ?? null;
}
