import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { DbClient } from "@/lib/supabase/server";
import { findPlaceholderMarkers } from "@/lib/admin/placeholderCopy";

/**
 * Expiry-hygiene cleanup repository — SERVICE-ROLE ONLY.
 *
 * This is the admin-portal twin of `scripts/cleanup-old-deals.ts`: it lists the
 * exact same candidates the script's dry-run prints, and applies the exact same
 * three state flips (`is_published=false`, signal `status='expired'`, feed item
 * `review_state='ignored'`). It NEVER deletes and NEVER publishes.
 *
 * The duplication with the CLI script is DELIBERATE. The script self-loads
 * `.env.local` and builds its own client so it can run standalone from a laptop;
 * this repo uses `getSupabaseAdmin()` and is called only from admin-gated server
 * actions. They are parallel implementations kept in sync by hand — do not make
 * one import the other. See `scripts/cleanup-old-deals.ts` for the CLI path.
 *
 * Like the other admin repos it must only run on the server behind
 * requireAdmin(); the browser guard inside getSupabaseAdmin() is the backstop.
 * No scraping / fetching / external calls — it talks only to our own Supabase
 * project. `revalidatePath` belongs in the actions layer, never here (repos are
 * also called from non-request contexts where revalidation is meaningless).
 */

// ── Pure date helpers (no DB — unit-tested in tests/admin/cleanup.test.ts) ─────

// AU-local "today" as YYYY-MM-DD so it compares directly to a `date` column,
// matching the cleanup script (lines 93–99) and the dashboard data-quality
// report (dashboard.ts) EXACTLY. Using an ISO/UTC "today" would shift the
// boundary by up to 11 hours and mis-classify a row expiring today.
const AU_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AU-Sydney calendar date (YYYY-MM-DD) for a given instant. */
export function auToday(now: Date): string {
  return AU_DAY_FMT.format(now);
}

/**
 * Strictly-before compare against the AU-Sydney calendar date. A row expiring
 * *today* is NOT expired (it is valid through the end of the day); only a
 * strictly-earlier expiry counts. Null expiry is never expired.
 */
export function isExpiredAu(expiry: string | null, todayStr: string): boolean {
  if (!expiry) return false;
  return expiry < todayStr;
}

/** Staged feed items older than this many days (by posted_at) are abandoned. */
export const STALE_FEED_DAYS = 60;

// ── Types ──────────────────────────────────────────────────────────────────────

/** The offer tables an "unpublish expired" apply can target (literal union — the
 *  ONLY source of a table name for the write path; never client input). */
export type UnpublishTable =
  | "cashback_offers"
  | "gift_card_offers"
  | "points_offers"
  | "card_offers"
  | "weekly_deals";

export const UNPUBLISH_TABLES: readonly UnpublishTable[] = [
  "cashback_offers",
  "gift_card_offers",
  "points_offers",
  "card_offers",
  "weekly_deals",
] as const;

/** One actionable expired-offer row. `merchantId` is set only where the table
 *  has one (cashback, points, weekly deals) — used to revalidate a store page. */
export interface ExpiredOfferCandidate {
  table: UnpublishTable;
  id: string;
  label: string;
  merchantId: string | null;
  expiryDate: string;
}

export interface ExpiredSignalCandidate {
  id: string;
  label: string;
  status: string;
  expiryDate: string;
}

export interface StaleFeedCandidate {
  id: string;
  label: string;
  postedAt: string;
}

/** A report-only row (no action) linking to its edit page. */
export interface ReportRow {
  table: UnpublishTable;
  id: string;
  label: string;
  /** Placeholder-copy markers (empty for the no-expiry report). */
  markers: string[];
}

export interface CleanupCandidates {
  today: string;
  staleFeedDays: number;
  expiredOffers: ExpiredOfferCandidate[];
  expiredSignals: ExpiredSignalCandidate[];
  staleFeedItems: StaleFeedCandidate[];
  publishedNoExpiry: ReportRow[];
  placeholderCopy: ReportRow[];
}

// ── Label logic (mirrors script main(), lines 362–413) ─────────────────────────

type Row = Record<string, unknown>;

const storeLabel = (r: Row): string =>
  String(r.merchant_id ?? r.brand ?? r.program ?? r.title ?? r.id);

/** Human label for an offer row, per table — mirrors the script exactly. */
export function labelFor(table: UnpublishTable, r: Row): string {
  switch (table) {
    case "cashback_offers":
      return `${storeLabel(r)} · ${String(r.provider ?? "")}`;
    case "gift_card_offers":
      return String(r.brand ?? r.id);
    case "points_offers":
      return `${String(r.program ?? "")} · ${storeLabel(r)}`;
    case "card_offers":
      return `${String(r.provider ?? "")} · ${String(r.card_name ?? r.id)}`;
    case "weekly_deals":
      return String(r.title ?? r.id);
  }
}

/** merchant_id where the table carries one (cashback, points, weekly deals). */
function merchantIdOf(table: UnpublishTable, r: Row): string | null {
  if (
    table === "cashback_offers" ||
    table === "points_offers" ||
    table === "weekly_deals"
  ) {
    const m = r.merchant_id;
    return typeof m === "string" && m.length > 0 ? m : null;
  }
  return null;
}

/** Columns to scan for placeholder copy, per table — mirrors script lines 383–414. */
function placeholderTextsFor(table: UnpublishTable, r: Row): (string | null)[] {
  switch (table) {
    case "cashback_offers":
      return [r.terms_summary as string | null];
    case "gift_card_offers":
      return [
        ...((r.usage_notes as string[] | null) ?? []),
        ...((r.stack_notes as string[] | null) ?? []),
      ];
    case "points_offers":
      return [r.earn_rate_display as string | null];
    case "card_offers":
      return [
        r.offer_summary as string | null,
        r.eligibility_notes as string | null,
        r.card_name as string | null,
      ];
    case "weekly_deals":
      return [r.title as string | null, r.summary as string | null];
  }
}

// ── Reads ──────────────────────────────────────────────────────────────────────

/** Tables the script scans for placeholder copy (weekly_deals included here but
 *  NOT in the no-expiry report — mirrors the script's table sets exactly). */
const PLACEHOLDER_TABLES: readonly UnpublishTable[] = UNPUBLISH_TABLES;
/** No-expiry report covers offer tables only — NOT weekly_deals (script main()):
 *  a weekly deal without an expiry is normal, not a data-quality flag. */
const NO_EXPIRY_TABLES: readonly UnpublishTable[] = [
  "cashback_offers",
  "gift_card_offers",
  "points_offers",
  "card_offers",
];

async function readExpiredOffers(
  db: DbClient,
  today: string
): Promise<ExpiredOfferCandidate[]> {
  const out: ExpiredOfferCandidate[] = [];
  for (const table of UNPUBLISH_TABLES) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("is_published", true)
      .not("expiry_date", "is", null)
      .lt("expiry_date", today);
    if (error) {
      throw new Error(`listCleanupCandidates read ${table} failed: ${error.message}`);
    }
    for (const r of (data ?? []) as Row[]) {
      out.push({
        table,
        id: String(r.id),
        label: labelFor(table, r),
        merchantId: merchantIdOf(table, r),
        expiryDate: String(r.expiry_date),
      });
    }
  }
  return out;
}

async function readExpiredSignals(
  db: DbClient,
  today: string
): Promise<ExpiredSignalCandidate[]> {
  const { data, error } = await db
    .from("ozbargain_signals")
    .select("id, title, status, expiry_date")
    .in("status", ["approved", "pending"])
    .not("expiry_date", "is", null)
    .lt("expiry_date", today);
  if (error) {
    throw new Error(`listCleanupCandidates read ozbargain_signals failed: ${error.message}`);
  }
  return ((data ?? []) as {
    id: string;
    title: string;
    status: string;
    expiry_date: string;
  }[]).map((r) => ({
    id: r.id,
    label: r.title,
    status: r.status,
    expiryDate: r.expiry_date,
  }));
}

async function readStaleFeedItems(
  db: DbClient,
  cutoffIso: string
): Promise<StaleFeedCandidate[]> {
  const { data, error } = await db
    .from("feed_items")
    .select("id, raw_title, posted_at")
    .eq("review_state", "new")
    .not("posted_at", "is", null)
    .lt("posted_at", cutoffIso);
  if (error) {
    throw new Error(`listCleanupCandidates read feed_items failed: ${error.message}`);
  }
  return ((data ?? []) as {
    id: string;
    raw_title: string;
    posted_at: string;
  }[]).map((r) => ({
    id: r.id,
    label: r.raw_title,
    postedAt: r.posted_at,
  }));
}

async function readPublishedNoExpiry(db: DbClient): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  for (const table of NO_EXPIRY_TABLES) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("is_published", true)
      .is("expiry_date", null);
    if (error) {
      throw new Error(`listCleanupCandidates read ${table} (no-expiry) failed: ${error.message}`);
    }
    for (const r of (data ?? []) as Row[]) {
      out.push({ table, id: String(r.id), label: labelFor(table, r), markers: [] });
    }
  }
  return out;
}

async function readPlaceholderCopy(db: DbClient): Promise<ReportRow[]> {
  const out: ReportRow[] = [];
  for (const table of PLACEHOLDER_TABLES) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("is_published", true);
    if (error) {
      throw new Error(`listCleanupCandidates read ${table} (placeholder) failed: ${error.message}`);
    }
    for (const r of (data ?? []) as Row[]) {
      const markers = findPlaceholderMarkers(placeholderTextsFor(table, r));
      if (markers.length > 0) {
        out.push({ table, id: String(r.id), label: labelFor(table, r), markers });
      }
    }
  }
  return out;
}

/**
 * List every cleanup candidate live from the DB — the exact set the script's
 * dry-run prints. `today` is the AU-Sydney calendar date; the stale-feed cutoff
 * is an ISO timestamp `STALE_FEED_DAYS` in the past (feed_items.posted_at is a
 * timestamptz).
 */
export async function listCleanupCandidates(now: Date): Promise<CleanupCandidates> {
  const db = getSupabaseAdmin();
  const today = auToday(now);
  const cutoffIso = new Date(now.getTime() - STALE_FEED_DAYS * 86_400_000).toISOString();

  const [expiredOffers, expiredSignals, staleFeedItems, publishedNoExpiry, placeholderCopy] =
    await Promise.all([
      readExpiredOffers(db, today),
      readExpiredSignals(db, today),
      readStaleFeedItems(db, cutoffIso),
      readPublishedNoExpiry(db),
      readPlaceholderCopy(db),
    ]);

  return {
    today,
    staleFeedDays: STALE_FEED_DAYS,
    expiredOffers,
    expiredSignals,
    staleFeedItems,
    publishedNoExpiry,
    placeholderCopy,
  };
}

// ── Writes (conditional, claim-first) ──────────────────────────────────────────
// Each write RE-CHECKS eligibility in the WHERE clause and verifies a row was
// actually claimed (.select("id") → 0 rows means the row no longer qualifies:
// edited/unpublished/expired elsewhere since the page rendered). PostgREST
// reports success on a 0-row update, so the length check is the real guard.
// The table name comes ONLY from the UnpublishTable literal union — never from
// client input (injection boundary; same reason the script hardcodes its unions).

/** Unpublish one published, still-expired offer row. Throws if no longer eligible. */
export async function applyUnpublishExpired(
  table: UnpublishTable,
  id: string,
  todayStr: string
): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from(table)
    .update({ is_published: false })
    .eq("id", id)
    .eq("is_published", true)
    .not("expiry_date", "is", null)
    .lt("expiry_date", todayStr)
    .select("id");
  if (error) throw new Error(`applyUnpublishExpired ${table} failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Row is no longer eligible — it may have been changed since this page loaded.");
  }
}

/** Expire one approved/pending, still-expired signal. Throws if no longer eligible. */
export async function applyExpireSignal(id: string, todayStr: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ozbargain_signals")
    .update({ status: "expired" })
    .eq("id", id)
    .in("status", ["approved", "pending"])
    .not("expiry_date", "is", null)
    .lt("expiry_date", todayStr)
    .select("id");
  if (error) throw new Error(`applyExpireSignal failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Signal is no longer eligible — it may have been changed since this page loaded.");
  }
}

/** Ignore one still-new, still-stale staged feed item. Throws if no longer eligible. */
export async function applyIgnoreStaleFeedItem(id: string, cutoffIso: string): Promise<void> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("feed_items")
    .update({ review_state: "ignored" })
    .eq("id", id)
    .eq("review_state", "new")
    .not("posted_at", "is", null)
    .lt("posted_at", cutoffIso)
    .select("id");
  if (error) throw new Error(`applyIgnoreStaleFeedItem failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Feed item is no longer eligible — it may have been changed since this page loaded.");
  }
}
