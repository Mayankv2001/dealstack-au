import { getStores } from "@/lib/repos/stores";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isStaticDataSource } from "@/lib/supabase/server";
import {
  rankTopDeals,
  type RankableFeedItem,
  type StoreRef,
  type TopDeal,
} from "@/lib/repos/topDealsRanking";

/**
 * "Today's top OzBargain signals" — public homepage repo.
 *
 * Reads ALREADY-STAGED feed_items (joined to feed_sources for the enabled
 * filter) and returns the top 5 ranked deals. SERVER-ONLY.
 *
 * Why service-role here (and not the public anon client): feed_items /
 * feed_sources are RLS default-deny with NO public policies (migration 002) —
 * the public anon key cannot read them by design, and we deliberately do NOT
 * broaden that. Instead this runs only on the server (the homepage server
 * component), reads with the service role, and returns a tightly-curated DTO of
 * at most 5 rows. The service-role key never reaches the browser, feed_sources
 * config stays private, and the staging tables remain unreadable by anon.
 *
 * It does NOT fetch OzBargain, call the monitor, change cron, or write anything.
 * On missing env / static mode / any error it returns [] (never throws), so the
 * homepage renders fine with the section simply hidden.
 */

const CANDIDATE_LIMIT = 50;
const TOP_LIMIT = 5;

/** Feed sources we never surface publicly are excluded via this allowlist of states. */
const PUBLIC_REVIEW_STATES = ["new", "imported"] as const;

interface FeedItemRow {
  id: string;
  source_native_id: string;
  link: string;
  raw_title: string;
  raw_summary: string;
  categories: string[] | null;
  posted_at: string | null;
  fetched_at: string;
  review_state: string;
  // Embedded one-to-one feed source (object, but type defensively as either).
  source: { is_enabled: boolean } | { is_enabled: boolean }[] | null;
}

function sourceEnabled(row: FeedItemRow): boolean {
  const src = Array.isArray(row.source) ? row.source[0] : row.source;
  return src?.is_enabled === true;
}

function toRankable(row: FeedItemRow): RankableFeedItem {
  return {
    id: row.id,
    nativeId: row.source_native_id,
    title: row.raw_title,
    summary: row.raw_summary,
    link: row.link,
    postedAt: row.posted_at,
    fetchedAt: row.fetched_at,
    categories: row.categories ?? [],
  };
}

/**
 * Top 5 staged OzBargain signals for the homepage, ranked by tracked-store
 * match, then useful keywords, then recency. Returns [] when Supabase is not
 * configured, in static mode, or on any read error.
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
    // Newest eligible items from ENABLED sources, excluding ignored/duplicate.
    const { data, error } = await db
      .from("feed_items")
      .select(
        "id, source_native_id, link, raw_title, raw_summary, categories, posted_at, fetched_at, review_state, source:feed_sources!inner(is_enabled)"
      )
      .in("review_state", [...PUBLIC_REVIEW_STATES])
      .order("fetched_at", { ascending: false })
      .limit(CANDIDATE_LIMIT);
    if (error) throw new Error(error.message);

    const rows = ((data ?? []) as unknown as FeedItemRow[]).filter(
      sourceEnabled
    );
    if (rows.length === 0) return [];

    const stores: StoreRef[] = (await getStores()).map((s) => ({
      id: s.id,
      name: s.name,
    }));

    return rankTopDeals(rows.map(toRankable), stores, limit);
  } catch (err) {
    console.warn(
      `[repos] topDeals: read failed, hiding section. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return [];
  }
}
