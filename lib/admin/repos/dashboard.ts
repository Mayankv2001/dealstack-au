import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DbClient } from "@/lib/supabase/server";

/**
 * Admin dashboard counts — SERVICE-ROLE ONLY.
 *
 * Reads aggregate row counts straight from Supabase with the service-role client
 * so the dashboard reflects EVERY row, including unpublished drafts and
 * pending/hidden signals that the public anon client (RLS) can never see. Like
 * the other admin repos, this must only run on the server behind requireAdmin();
 * the browser guard inside getSupabaseAdmin() is the backstop.
 *
 * Counts use head:true exact counts, so no row data crosses the wire — just the
 * numbers. No scraping / agents / external source calls live here — it talks
 * only to our own Supabase project.
 */

/** Counts for a publish-flagged section (cashback, gift cards, points, weekly). */
export interface PublishCount {
  total: number;
  published: number;
  unpublished: number;
}

/** Counts for the moderated signals section (status-based, not is_published). */
export interface SignalCount {
  total: number;
  approved: number;
  pending: number;
}

export interface DashboardCounts {
  cashback: PublishCount;
  giftCards: PublishCount;
  points: PublishCount;
  signals: SignalCount;
  weeklyDeals: PublishCount;
}

/** Exact total row count for a table (no rows transferred). */
async function countAll(db: DbClient, table: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`count ${table} failed: ${error.message}`);
  return count ?? 0;
}

/** Exact row count for a table filtered to a single column value. */
async function countWhere(
  db: DbClient,
  table: string,
  column: string,
  value: string | boolean
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) {
    throw new Error(`count ${table} where ${column}=${value} failed: ${error.message}`);
  }
  return count ?? 0;
}

/** Builds a {total, published, unpublished} triple for an is_published table. */
async function publishCount(
  db: DbClient,
  table: string
): Promise<PublishCount> {
  const [total, published] = await Promise.all([
    countAll(db, table),
    countWhere(db, table, "is_published", true),
  ]);
  return { total, published, unpublished: total - published };
}

/** Every dashboard count, fetched in parallel. */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const db = getSupabaseAdmin();

  const [
    cashback,
    giftCards,
    points,
    weeklyDeals,
    signalsTotal,
    signalsApproved,
    signalsPending,
  ] = await Promise.all([
    publishCount(db, "cashback_offers"),
    publishCount(db, "gift_card_offers"),
    publishCount(db, "points_offers"),
    publishCount(db, "weekly_deals"),
    countAll(db, "ozbargain_signals"),
    countWhere(db, "ozbargain_signals", "status", "approved"),
    countWhere(db, "ozbargain_signals", "status", "pending"),
  ]);

  return {
    cashback,
    giftCards,
    points,
    weeklyDeals,
    signals: {
      total: signalsTotal,
      approved: signalsApproved,
      pending: signalsPending,
    },
  };
}
