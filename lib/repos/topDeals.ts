import { getStores } from "@/lib/repos/stores";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isStaticDataSource } from "@/lib/supabase/server";
import {
  rankTopDeals,
  type RankableFeedItem,
  type StoreRef,
  type TopDeal,
} from "@/lib/repos/topDealsRanking";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * "Today's top OzBargain signals" — public homepage repo.
 *
 * Reads ADMIN-REVIEWED feed_items joined to their approved signal and returns
 * the top 5 ranked deals. SERVER-ONLY.
 *
 * Publication is a two-step opt-in: the feed item must be imported from the
 * review queue AND its promoted signal must later be approved. Raw staged items
 * and pending signals are never shown. Public copy always comes from the
 * moderated signal, not the raw feed snapshot.
 *
 * Why service-role here (and not the public anon client): feed_items is RLS
 * default-deny with NO public policies (migration 002) — the public anon key
 * cannot read it by design, and we deliberately do NOT broaden that. Instead
 * this runs only on the server (the homepage server
 * component), reads with the service role, and returns a tightly-curated DTO of
 * at most 5 rows. The service-role key never reaches the browser and the staging
 * tables remain unreadable by anon.
 *
 * It does NOT fetch OzBargain, call the monitor, change cron, or write anything.
 * On missing env / static mode / any error it returns [] (never throws), so the
 * homepage renders fine with the section simply hidden.
 */

const CANDIDATE_LIMIT = 50;
const TOP_LIMIT = 5;

/**
 * The only feed-item review state the homepage may consider. Import is
 * necessary but not sufficient: the linked signal must also be approved.
 * 'new' (unreviewed), 'ignored' and 'duplicate' never surface. Exported so
 * tests pin this opt-in behaviour.
 */
export const PUBLIC_REVIEW_STATES = ["imported"] as const;

/** The only promoted-signal state eligible for the public homepage. */
export const PUBLIC_SIGNAL_STATUSES = ["approved"] as const;

export interface TopDealSignalRow {
  id: string;
  source_native_id: string | null;
  title: string;
  summary: string;
  source_url: string;
  posted_at: string | null;
  expiry_date: string | null;
  tags: string[] | null;
  is_sample: boolean;
  status: string;
  last_checked_at: string;
}

/** Raw service-role query shape, exported only so eligibility stays testable. */
export interface TopDealCandidateRow {
  id: string;
  source_native_id: string;
  fetched_at: string;
  review_state: string;
  hidden_from_homepage: boolean;
  // A many-to-one embed is an object; include the array shape defensively.
  signal: TopDealSignalRow | TopDealSignalRow[] | null;
}

function promotedSignal(row: TopDealCandidateRow): TopDealSignalRow | null {
  if (Array.isArray(row.signal)) return row.signal[0] ?? null;
  return row.signal;
}

/**
 * Enforce publication state again after the DB query and map approved copy.
 * Feed-source enablement is deliberately absent: it controls future fetching,
 * not whether already-reviewed content remains public.
 */
export function topDealCandidateToRankable(
  row: TopDealCandidateRow,
  today: string
): RankableFeedItem | null {
  const signal = promotedSignal(row);
  const sourceUrl = signal ? safeHttpsUrl(signal.source_url) : null;
  if (
    row.review_state !== "imported" ||
    row.hidden_from_homepage ||
    !signal ||
    signal.status !== "approved" ||
    signal.is_sample !== false ||
    isPastExpiry(signal.expiry_date, today) ||
    !sourceUrl
  ) {
    return null;
  }

  return {
    id: signal.id,
    nativeId: signal.source_native_id || row.source_native_id,
    title: signal.title,
    summary: signal.summary,
    link: sourceUrl,
    postedAt: signal.posted_at,
    fetchedAt: row.fetched_at,
    categories: signal.tags ?? [],
  };
}

/**
 * Top 5 admin-imported OzBargain signals for the homepage, ranked by
 * tracked-store match, then useful keywords, then recency. Returns [] when
 * Supabase is not configured, in static mode, or on any read error.
 */
export async function getTopDeals(limit = TOP_LIMIT): Promise<TopDeal[]> {
  if (isStaticDataSource()) return [];
  // Need the service-role key (server only) AND a project URL to read at all.
  if (
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL
  ) {
    return [];
  }

  try {
    const db = getSupabaseAdmin();
    const today = todayAU();
    // The feed row supplies ingestion/curation state only. The joined signal is
    // the publication authority and the sole source of public-facing copy.
    // Source enablement is intentionally not queried: disabling a feed stops
    // future fetches without unpublishing content that passed moderation.
    const { data, error } = await db
      .from("feed_items")
      .select(
        "id, source_native_id, fetched_at, review_state, hidden_from_homepage, signal:ozbargain_signals!inner(id, source_native_id, title, summary, source_url, posted_at, expiry_date, tags, is_sample, status, last_checked_at)"
      )
      .in("review_state", [...PUBLIC_REVIEW_STATES])
      .eq("hidden_from_homepage", false)
      .in("signal.status", [...PUBLIC_SIGNAL_STATUSES])
      .eq("signal.is_sample", false)
      .or(`expiry_date.is.null,expiry_date.gte.${today}`, {
        referencedTable: "signal",
      })
      .order("fetched_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as unknown as TopDealCandidateRow[];
    const candidates = rows
      .map((row) => topDealCandidateToRankable(row, today))
      .filter((row): row is RankableFeedItem => row !== null);
    if (candidates.length === 0) return [];

    const stores: StoreRef[] = (await getStores()).map((s) => ({
      id: s.id,
      name: s.name,
    }));

    return rankTopDeals(candidates, stores, limit);
  } catch (err) {
    console.warn(
      `[repos] topDeals: read failed, hiding section. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}
