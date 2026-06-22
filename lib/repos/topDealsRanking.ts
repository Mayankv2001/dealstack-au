/**
 * Pure ranking helpers for "Today's top OzBargain signals" — OFFLINE ONLY.
 *
 * No network, no DB, no env. Given already-staged feed items plus the list of
 * tracked stores, it ranks them for the homepage and shapes a safe public DTO.
 * The DB read + safety filtering live in lib/repos/topDeals.ts; this module is
 * the testable scoring core.
 *
 * Ranking order (highest first):
 *   1. tracked-store match (an item that names one of our stores)
 *   2. useful keyword hits (programs / categories / store names)
 *   3. recency (newest posted_at, else fetched_at)
 */

export type Relevance = "high" | "medium" | "low";

/** A tracked store, just what ranking needs. */
export interface StoreRef {
  id: string;
  name: string;
}

/** A staged feed item normalised for ranking (snake_case already mapped away). */
export interface RankableFeedItem {
  id: string;
  nativeId: string;
  title: string;
  summary: string;
  link: string;
  postedAt: string | null;
  fetchedAt: string;
  categories: string[];
}

/** The public, sanitised shape rendered on the homepage. */
export interface TopDeal {
  id: string;
  title: string;
  summary: string;
  sourceUrl: string;
  sourceHost: string;
  postedAt: string | null;
  fetchedAt: string;
  categories: string[];
  nativeId: string;
  relevance: Relevance;
  matchedStoreName: string | null;
}

/**
 * Useful keywords (lowercased). Loyalty programs, savings categories and the
 * big AU retailers people search for. Matching is case-insensitive substring.
 */
export const TOP_DEAL_KEYWORDS = [
  "qantas",
  "velocity",
  "flybuys",
  "everyday rewards",
  "gift card",
  "cashback",
  "points",
  "jb hi-fi",
  "officeworks",
  "the good guys",
  "coles",
  "woolworths",
  "amazon",
  "myer",
  "chemist warehouse",
] as const;

/** Host of a URL without a leading www., or "" when unparseable. */
export function sourceHostFromUrl(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Lowercased store name with a trailing " au"/" australia" trimmed for matching. */
function storeNeedle(name: string): string {
  return name.toLowerCase().replace(/\s+(au|australia)$/, "").trim();
}

/** First tracked store named in the haystack, or null. */
export function matchStoreName(
  haystack: string,
  stores: StoreRef[]
): string | null {
  for (const store of stores) {
    const needle = storeNeedle(store.name);
    if (needle && haystack.includes(needle)) return store.name;
  }
  return null;
}

/** Count of distinct keywords present in the haystack. */
export function countKeywordHits(haystack: string): number {
  return TOP_DEAL_KEYWORDS.reduce(
    (n, kw) => (haystack.includes(kw) ? n + 1 : n),
    0
  );
}

/** Best timestamp for recency: posted_at if valid, else fetched_at, else 0. */
function recencyMs(item: RankableFeedItem): number {
  const posted = item.postedAt ? Date.parse(item.postedAt) : NaN;
  if (!Number.isNaN(posted)) return posted;
  const fetched = Date.parse(item.fetchedAt);
  return Number.isNaN(fetched) ? 0 : fetched;
}

interface Scored {
  item: RankableFeedItem;
  matchedStoreName: string | null;
  keywordHits: number;
  ts: number;
}

function score(item: RankableFeedItem, stores: StoreRef[]): Scored {
  const haystack = `${item.title} ${item.summary} ${item.categories.join(" ")}`
    .toLowerCase();
  return {
    item,
    matchedStoreName: matchStoreName(haystack, stores),
    keywordHits: countKeywordHits(haystack),
    ts: recencyMs(item),
  };
}

function relevanceOf(s: Scored): Relevance {
  if (s.matchedStoreName) return "high";
  if (s.keywordHits >= 1) return "medium";
  return "low";
}

/**
 * Rank staged items and return the top `limit` as public DTOs. Pure: callers
 * pass in the already-filtered candidate items (no ignored/duplicate) and the
 * tracked stores. Sort is by store match, then keyword hits, then recency.
 */
export function rankTopDeals(
  items: RankableFeedItem[],
  stores: StoreRef[],
  limit = 5
): TopDeal[] {
  const scored = items.map((item) => score(item, stores));
  scored.sort((a, b) => {
    const aStore = a.matchedStoreName ? 1 : 0;
    const bStore = b.matchedStoreName ? 1 : 0;
    if (aStore !== bStore) return bStore - aStore;
    if (a.keywordHits !== b.keywordHits) return b.keywordHits - a.keywordHits;
    return b.ts - a.ts;
  });

  return scored.slice(0, Math.max(0, limit)).map((s) => ({
    id: s.item.id,
    title: s.item.title,
    summary: s.item.summary,
    sourceUrl: s.item.link,
    sourceHost: sourceHostFromUrl(s.item.link),
    postedAt: s.item.postedAt,
    fetchedAt: s.item.fetchedAt,
    categories: s.item.categories,
    nativeId: s.item.nativeId,
    relevance: relevanceOf(s),
    matchedStoreName: s.matchedStoreName,
  }));
}
