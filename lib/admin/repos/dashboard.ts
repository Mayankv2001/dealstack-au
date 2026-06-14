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

// ── Recent updates feed ──────────────────────────────────────────────────────

/** Which admin section a recent item belongs to. */
export type RecentItemType =
  | "cashback"
  | "giftCards"
  | "points"
  | "signals"
  | "weeklyDeals";

/** One row in the "Recent updates" feed, normalised across every table. */
export interface RecentItem {
  type: RecentItemType;
  /** Human label for the type column ("Cashback", "Gift card", …). */
  typeLabel: string;
  id: string;
  /** Title / name to display. */
  title: string;
  /** Status text ("Published" / "Draft", or the signal status). */
  status: string;
  /** Whether the row is live (published / approved) — drives the badge tone. */
  isLive: boolean;
  updatedAt: string;
  /** Admin edit route for this row. */
  editHref: string;
}

/** Status + tone for an is_published table. */
function publishStatus(isPublished: boolean): { status: string; isLive: boolean } {
  return isPublished
    ? { status: "Published", isLive: true }
    : { status: "Draft", isLive: false };
}

/** Unwraps PostgREST's embedded one-to-one store (object, or array defensively). */
function embeddedStoreName(
  store: { name: string } | { name: string }[] | null | undefined
): string | null {
  const s = Array.isArray(store) ? store[0] : store;
  return s?.name ?? null;
}

/** Shared query: newest-edited rows for one table (only the columns we need). */
async function queryRecent<R>(
  db: DbClient,
  table: string,
  select: string,
  limit: number
): Promise<R[]> {
  const { data, error } = await db
    .from(table)
    .select(select)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recent ${table} failed: ${error.message}`);
  return (data ?? []) as unknown as R[];
}

interface CashbackRecentRow {
  id: string;
  provider: string;
  merchant_id: string;
  is_published: boolean;
  updated_at: string;
  store: { name: string } | { name: string }[] | null;
}

interface GiftCardRecentRow {
  id: string;
  brand: string;
  is_published: boolean;
  updated_at: string;
}

interface PointsRecentRow {
  id: string;
  program: string;
  merchant_id: string | null;
  is_published: boolean;
  updated_at: string;
  store: { name: string } | { name: string }[] | null;
}

interface SignalRecentRow {
  id: string;
  title: string;
  status: string;
  updated_at: string;
}

interface WeeklyDealRecentRow {
  id: string;
  title: string;
  is_published: boolean;
  updated_at: string;
}

/**
 * Latest `limit` changed items across cashback, gift cards, points, signals and
 * weekly deals. Pulls the newest `limit` rows from each table (so the merged
 * top-`limit` is always correct), then sorts by updated_at and trims. Edit links
 * point at the per-section admin route.
 */
export async function getRecentUpdates(limit = 5): Promise<RecentItem[]> {
  const db = getSupabaseAdmin();

  const [cashback, giftCards, points, signals, weeklyDeals] = await Promise.all([
    queryRecent<CashbackRecentRow>(
      db,
      "cashback_offers",
      "id, provider, merchant_id, is_published, updated_at, store:stores(name)",
      limit
    ),
    queryRecent<GiftCardRecentRow>(
      db,
      "gift_card_offers",
      "id, brand, is_published, updated_at",
      limit
    ),
    queryRecent<PointsRecentRow>(
      db,
      "points_offers",
      "id, program, merchant_id, is_published, updated_at, store:stores(name)",
      limit
    ),
    queryRecent<SignalRecentRow>(
      db,
      "ozbargain_signals",
      "id, title, status, updated_at",
      limit
    ),
    queryRecent<WeeklyDealRecentRow>(
      db,
      "weekly_deals",
      "id, title, is_published, updated_at",
      limit
    ),
  ]);

  const items: RecentItem[] = [
    ...cashback.map((r) => ({
      type: "cashback" as const,
      typeLabel: "Cashback",
      id: r.id,
      title: `${embeddedStoreName(r.store) ?? r.merchant_id} · ${r.provider}`,
      ...publishStatus(r.is_published),
      updatedAt: r.updated_at,
      editHref: `/admin/cashback/${r.id}/edit`,
    })),
    ...giftCards.map((r) => ({
      type: "giftCards" as const,
      typeLabel: "Gift card",
      id: r.id,
      title: r.brand,
      ...publishStatus(r.is_published),
      updatedAt: r.updated_at,
      editHref: `/admin/gift-cards/${r.id}/edit`,
    })),
    ...points.map((r) => ({
      type: "points" as const,
      typeLabel: "Points",
      id: r.id,
      title: embeddedStoreName(r.store)
        ? `${r.program} · ${embeddedStoreName(r.store)}`
        : r.program,
      ...publishStatus(r.is_published),
      updatedAt: r.updated_at,
      editHref: `/admin/points/${r.id}/edit`,
    })),
    ...signals.map((r) => ({
      type: "signals" as const,
      typeLabel: "Signal",
      id: r.id,
      title: r.title,
      status: r.status.charAt(0).toUpperCase() + r.status.slice(1),
      isLive: r.status === "approved",
      updatedAt: r.updated_at,
      editHref: `/admin/signals/${r.id}/edit`,
    })),
    ...weeklyDeals.map((r) => ({
      type: "weeklyDeals" as const,
      typeLabel: "Weekly deal",
      id: r.id,
      title: r.title,
      ...publishStatus(r.is_published),
      updatedAt: r.updated_at,
      editHref: `/admin/weekly-deals/${r.id}/edit`,
    })),
  ];

  // ISO timestamps sort lexicographically; newest first, then trim to the merge.
  return items
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}
