import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DbClient } from "@/lib/supabase/server";
import { weekMondayAU } from "@/lib/admin/dateHelpers";

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
  cardOffers: PublishCount;
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
    cardOffers,
    signalsTotal,
    signalsApproved,
    signalsPending,
  ] = await Promise.all([
    publishCount(db, "cashback_offers"),
    publishCount(db, "gift_card_offers"),
    publishCount(db, "points_offers"),
    publishCount(db, "weekly_deals"),
    publishCount(db, "card_offers"),
    countAll(db, "ozbargain_signals"),
    countWhere(db, "ozbargain_signals", "status", "approved"),
    countWhere(db, "ozbargain_signals", "status", "pending"),
  ]);

  return {
    cashback,
    giftCards,
    points,
    weeklyDeals,
    cardOffers,
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
  | "weeklyDeals"
  | "cardOffers";

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

interface CardOfferRecentRow {
  id: string;
  provider: string;
  card_name: string;
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

  const [cashback, giftCards, points, signals, weeklyDeals, cardOffers] =
    await Promise.all([
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
      queryRecent<CardOfferRecentRow>(
        db,
        "card_offers",
        "id, provider, card_name, is_published, updated_at",
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
    ...cardOffers.map((r) => ({
      type: "cardOffers" as const,
      typeLabel: "Card offer",
      id: r.id,
      title: `${r.provider} · ${r.card_name}`,
      ...publishStatus(r.is_published),
      updatedAt: r.updated_at,
      editHref: `/admin/card-offers/${r.id}/edit`,
    })),
  ];

  // ISO timestamps sort lexicographically; newest first, then trim to the merge.
  return items
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit);
}

// ── Data quality report ──────────────────────────────────────────────────────

/** A published row is "stale" if it hasn't been re-checked in this many days. */
const STALE_DAYS = 30;
/** Default number of flags the dashboard shows before "Show all". */
export const DQ_FLAG_LIMIT = 12;

export type DataQualitySeverity = "high" | "medium";

/** The data-quality checks an item can fail. */
export type DataQualityIssueCode =
  | "expired"
  | "missing-source"
  | "stale"
  | "missing-expiry"
  | "stale-week-of";

/** One failed check on a flagged item. */
export interface DataQualityIssue {
  code: DataQualityIssueCode;
  /** Human-readable detail, e.g. "Expired 2026-05-01 but still live". */
  label: string;
}

/** One flagged item shown in the dashboard data-quality list. */
export interface DataQualityFlag {
  type: RecentItemType;
  typeLabel: string;
  id: string;
  title: string;
  /** Every check this item failed (highest-severity issue drives `severity`). */
  issues: DataQualityIssue[];
  severity: DataQualitySeverity;
  editHref: string;
  /** Shown when present, so admins can eyeball dates without opening the row. */
  expiryDate: string | null;
  lastCheckedAt: string | null;
}

/** Per-issue counts (an item may contribute to more than one). */
export interface DataQualityCounts {
  expiredPublished: number;
  missingSourceUrl: number;
  missingExpiry: number;
  staleChecked: number;
  staleWeekOf: number;
}

export interface DataQualityReport {
  counts: DataQualityCounts;
  /** Distinct items with at least one high/medium issue. */
  flaggedItems: number;
  /** Every flagged item, highest severity first (the page caps the display). */
  flags: DataQualityFlag[];
}

/** True when a jsonb citations value has at least one usable source URL. */
function hasSourceUrl(citations: unknown): boolean {
  if (!Array.isArray(citations)) return false;
  return citations.some((c) => {
    if (c == null || typeof c !== "object") return false;
    const url = (c as { sourceUrl?: unknown }).sourceUrl;
    return typeof url === "string" && url.trim() !== "";
  });
}

// AU-local "today" as YYYY-MM-DD so it compares directly to a date column string.
const DQ_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface CashbackDqRow {
  id: string;
  provider: string;
  merchant_id: string;
  expiry_date: string | null;
  citations: unknown;
  last_checked_at: string | null;
  store: { name: string } | { name: string }[] | null;
}
interface GiftCardDqRow {
  id: string;
  brand: string;
  expiry_date: string | null;
  citations: unknown;
  last_checked_at: string | null;
}
interface PointsDqRow {
  id: string;
  program: string;
  merchant_id: string | null;
  expiry_date: string | null;
  citations: unknown;
  last_checked_at: string | null;
  store: { name: string } | { name: string }[] | null;
}
interface SignalDqRow {
  id: string;
  title: string;
  expiry_date: string | null;
  last_checked_at: string | null;
}

interface WeeklyDealDqRow {
  id: string;
  title: string;
  week_of: string;
}

interface CardOfferDqRow {
  id: string;
  provider: string;
  card_name: string;
  expiry_date: string | null;
  source_url: string;
  last_checked_at: string | null;
}

/**
 * Read-only data-quality scan of PUBLISHED offers + APPROVED signals (i.e. the
 * rows the public site can actually show). Surfaces:
 *   - expired-but-still-live rows (high),
 *   - published offers with no cited source URL (medium),
 *   - rows not re-checked in over STALE_DAYS (medium),
 *   - published offers with no expiry date (low — counted, not listed).
 *
 * Service-role only; counts/flags only, no writes. Row volume is small (manual
 * data), so published rows are fetched and classified in JS.
 */
export async function getDataQualityReport(): Promise<DataQualityReport> {
  const db = getSupabaseAdmin();
  const now = new Date();
  const todayStr = DQ_DAY_FMT.format(now);
  const staleBeforeMs = now.getTime() - STALE_DAYS * 86_400_000;

  const [cashback, giftCards, points, signals, weeklyDeals, cardOffers] =
    await Promise.all([
      db
        .from("cashback_offers")
        .select(
          "id, provider, merchant_id, expiry_date, citations, last_checked_at, store:stores(name)"
        )
        .eq("is_published", true),
      db
        .from("gift_card_offers")
        .select("id, brand, expiry_date, citations, last_checked_at")
        .eq("is_published", true),
      db
        .from("points_offers")
        .select(
          "id, program, merchant_id, expiry_date, citations, last_checked_at, store:stores(name)"
        )
        .eq("is_published", true),
      db
        .from("ozbargain_signals")
        .select("id, title, expiry_date, last_checked_at")
        .eq("status", "approved"),
      db
        .from("weekly_deals")
        .select("id, title, week_of")
        .eq("is_published", true),
      db
        .from("card_offers")
        .select("id, provider, card_name, expiry_date, source_url, last_checked_at")
        .eq("is_published", true),
    ]);

  for (const res of [cashback, giftCards, points, signals, weeklyDeals, cardOffers]) {
    if (res.error) {
      throw new Error(`data quality read failed: ${res.error.message}`);
    }
  }

  const currentWeekMonday = weekMondayAU(now);

  const counts: DataQualityCounts = {
    expiredPublished: 0,
    missingSourceUrl: 0,
    missingExpiry: 0,
    staleChecked: 0,
    staleWeekOf: 0,
  };
  const flags: DataQualityFlag[] = [];

  /** Classify one row, tallying counts and (for high/medium) adding a flag. */
  function consider(opts: {
    type: RecentItemType;
    typeLabel: string;
    id: string;
    title: string;
    editHref: string;
    expiryDate: string | null;
    citations?: unknown;
    lastChecked: string | null;
    /** Offers cite sources + should have an expiry; signals do neither here. */
    checkSource: boolean;
    checkMissingExpiry: boolean;
  }): void {
    const issues: DataQualityIssue[] = [];
    let severity: DataQualitySeverity | null = null;

    if (opts.expiryDate != null && opts.expiryDate < todayStr) {
      counts.expiredPublished += 1;
      issues.push({
        code: "expired",
        label: `Expired ${opts.expiryDate} but still live`,
      });
      severity = "high";
    }
    if (opts.checkSource && !hasSourceUrl(opts.citations)) {
      counts.missingSourceUrl += 1;
      issues.push({ code: "missing-source", label: "No source URL cited" });
      if (severity == null) severity = "medium";
    }
    if (
      opts.lastChecked != null &&
      Date.parse(opts.lastChecked) < staleBeforeMs
    ) {
      counts.staleChecked += 1;
      issues.push({ code: "stale", label: "Not re-checked in 30+ days" });
      if (severity == null) severity = "medium";
    }
    if (opts.checkMissingExpiry && opts.expiryDate == null) {
      counts.missingExpiry += 1;
      // Low severity: counted, and listed only if the item is already flagged.
      if (severity != null) {
        issues.push({ code: "missing-expiry", label: "No expiry date set" });
      }
    }

    if (severity != null) {
      flags.push({
        type: opts.type,
        typeLabel: opts.typeLabel,
        id: opts.id,
        title: opts.title,
        issues,
        severity,
        editHref: opts.editHref,
        expiryDate: opts.expiryDate,
        lastCheckedAt: opts.lastChecked,
      });
    }
  }

  for (const r of cashback.data as unknown as CashbackDqRow[]) {
    consider({
      type: "cashback",
      typeLabel: "Cashback",
      id: r.id,
      title: `${embeddedStoreName(r.store) ?? r.merchant_id} · ${r.provider}`,
      editHref: `/admin/cashback/${r.id}/edit`,
      expiryDate: r.expiry_date,
      citations: r.citations,
      lastChecked: r.last_checked_at,
      checkSource: true,
      checkMissingExpiry: true,
    });
  }
  for (const r of giftCards.data as unknown as GiftCardDqRow[]) {
    consider({
      type: "giftCards",
      typeLabel: "Gift card",
      id: r.id,
      title: r.brand,
      editHref: `/admin/gift-cards/${r.id}/edit`,
      expiryDate: r.expiry_date,
      citations: r.citations,
      lastChecked: r.last_checked_at,
      checkSource: true,
      checkMissingExpiry: true,
    });
  }
  for (const r of points.data as unknown as PointsDqRow[]) {
    const store = embeddedStoreName(r.store);
    consider({
      type: "points",
      typeLabel: "Points",
      id: r.id,
      title: store ? `${r.program} · ${store}` : r.program,
      editHref: `/admin/points/${r.id}/edit`,
      expiryDate: r.expiry_date,
      citations: r.citations,
      lastChecked: r.last_checked_at,
      checkSource: true,
      checkMissingExpiry: true,
    });
  }
  for (const r of signals.data as unknown as SignalDqRow[]) {
    consider({
      type: "signals",
      typeLabel: "Signal",
      id: r.id,
      title: r.title,
      editHref: `/admin/signals/${r.id}/edit`,
      expiryDate: r.expiry_date,
      lastChecked: r.last_checked_at,
      // source_url is NOT NULL for signals; expiry is often legitimately absent.
      checkSource: false,
      checkMissingExpiry: false,
    });
  }
  for (const r of cardOffers.data as unknown as CardOfferDqRow[]) {
    consider({
      type: "cardOffers",
      typeLabel: "Card offer",
      id: r.id,
      title: `${r.provider} · ${r.card_name}`,
      editHref: `/admin/card-offers/${r.id}/edit`,
      expiryDate: r.expiry_date,
      // card_offers stores a single source_url string; adapt it to the
      // citations shape hasSourceUrl() expects.
      citations:
        typeof r.source_url === "string" && r.source_url.trim() !== ""
          ? [{ sourceUrl: r.source_url }]
          : [],
      lastChecked: r.last_checked_at,
      checkSource: true,
      checkMissingExpiry: true,
    });
  }

  // Weekly deals: flag published ones whose week_of is from a prior week.
  for (const r of weeklyDeals.data as unknown as WeeklyDealDqRow[]) {
    if (r.week_of < currentWeekMonday) {
      counts.staleWeekOf += 1;
      flags.push({
        type: "weeklyDeals",
        typeLabel: "Weekly deal",
        id: r.id,
        title: r.title,
        issues: [
          {
            code: "stale-week-of",
            label: `weekOf ${r.week_of} — prior week`,
          },
        ],
        severity: "medium",
        editHref: `/admin/weekly-deals/${r.id}/edit`,
        expiryDate: null,
        lastCheckedAt: null,
      });
    }
  }

  const severityRank: Record<DataQualitySeverity, number> = {
    high: 0,
    medium: 1,
  };
  flags.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    counts,
    flaggedItems: flags.length,
    flags,
  };
}
