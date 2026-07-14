/**
 * Pure ranking helpers for "Today's top OzBargain signals" — OFFLINE ONLY.
 *
 * No network, no DB, no env. Given already-staged feed items plus the list of
 * tracked stores, it ranks them for the homepage and shapes a safe public DTO.
 * The DB read + safety filtering live in lib/repos/topDeals.ts; this module is
 * the testable scoring core.
 *
 * Ranking order (highest first, after upstream publication eligibility):
 *   1. confirmed-current date state (unknown dates remain visible but lower)
 *   2. most recent completed source check
 *   3. tracked-store match (an item that names one of our stores)
 *   4. relevance score = useful keyword hits MINUS broad/unrelated penalties
 *      (so anime figures, random gaming peripherals, generic fashion and
 *      unrelated home goods sink below genuine stacking signals)
 *   5. recency (newest posted_at, else fetched_at)
 * The final homepage selection prefers one item per merchant, normally caps a
 * merchant at two, and relaxes that cap only for genuinely sparse data.
 */

import { DEAL_CATEGORY_KEYWORDS } from "@/lib/dealCategories";

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
  lastCheckedAt: string | null;
  expiryDate: string | null;
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
  lastCheckedAt: string | null;
  expiryDate: string | null;
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
  ...new Set([
    "qantas",
    "velocity",
    "flybuys",
    "everyday rewards",
    "bonus points",
    "store credit",
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
    "kogan",
    // Broader expansion: credit card sign-up bonuses, named bank offers, and
    // the two permitted cashback portals — see docs/source-expansion-strategy.md.
    // Deliberately NOT adding a generic "grocery"/"groceries" keyword here:
    // OzBargain tags many off-theme items (protein supplements, snacks) under
    // its broad "Groceries" category, so it would over-boost them. Coles/
    // Woolworths (above) already give grocery deals a strong, precise signal
    // via the tracked-store match.
    ...DEAL_CATEGORY_KEYWORDS.credit_card_bonus,
    ...DEAL_CATEGORY_KEYWORDS.bank_offer,
    "shopback",
    "topcashback",
  ]),
] as const;

/**
 * High-priority CATEGORY keywords (lowercased) — the deal categories we want to
 * surface first: tech/electronics, clothing/fashion, gift cards/vouchers,
 * perfume/beauty, automotive and household/home goods. Each match adds to an
 * item's relevance score exactly like the loyalty/store keywords above, so a
 * laptop / sneaker / fragrance / tyre / cookware deal now ranks as a genuine
 * signal instead of being treated as broad/unrelated.
 *
 * Terms are kept specific to avoid false positives (e.g. "home & garden" and
 * "homeware" rather than bare "home"; "vehicle"/"tyre"/"automotive" rather than
 * bare "car", which is a substring of "card"/"care"). Many map straight onto the
 * OzBargain category labels carried on each item ("Electrical & Electronics",
 * "Fashion & Apparel", "Health & Beauty", "Automotive", "Home & Garden").
 */
export const CATEGORY_PRIORITY_KEYWORDS = [
  // Tech / electronics
  "electronics",
  "electrical",
  "computing",
  "computer",
  "laptop",
  "phone",
  "iphone",
  "android",
  "tv",
  "soundbar",
  "headphones",
  "earbuds",
  "monitor",
  "tablet",
  "camera",
  "appliance",
  "appliances",
  "refrigerator",
  "fridge",
  "washing machine",
  "dryer",
  "dishwasher",
  "vacuum",
  // Clothing / fashion
  "fashion",
  "clothing",
  "apparel",
  "shoes",
  "sneakers",
  "footwear",
  "jacket",
  // Gift cards / vouchers (gift card is already a loyalty keyword above)
  "voucher",
  // Perfume / beauty
  "perfume",
  "fragrance",
  "beauty",
  "skincare",
  "grooming",
  "cosmetic",
  "makeup",
  // Automotive
  "automotive",
  "tyre",
  "tyres",
  "motor oil",
  "engine oil",
  "vehicle",
  // Household / home goods
  "home & garden",
  "household",
  "homeware",
  "furniture",
  "kitchen",
  "cookware",
  "dinnerware",
  "cleaning",
  "tools",
  // Named dining-delivery platforms (specific brand names, not generic
  // "dining"/"restaurant" wording — those stay unscored, same as before)
  ...DEAL_CATEGORY_KEYWORDS.dining_delivery,
] as const;

/** Combined positive keyword set (loyalty/store + priority categories), deduped. */
const POSITIVE_KEYWORDS: readonly string[] = [
  ...new Set<string>([...TOP_DEAL_KEYWORDS, ...CATEGORY_PRIORITY_KEYWORDS]),
];

/**
 * De-prioritised category signals (lowercased). OzBargain surfaces a lot of
 * collectibles, random gaming pre-orders / digital keys, liquor, low-value
 * grocery snacks and in-store-only clearance that are NOT among the categories
 * we want to surface. Each match subtracts from the relevance score so these
 * rank below genuine signals.
 *
 * Note: generic fashion and home goods are NO LONGER penalised here — they are
 * now high-priority categories (see CATEGORY_PRIORITY_KEYWORDS). Likewise gaming
 * PERIPHERALS (headsets etc.) are treated as ordinary electronics; only gaming
 * PRE-ORDERS / digital game keys are de-prioritised.
 *
 * Terms are deliberately specific to avoid false positives against the positive
 * keywords or store names above (e.g. "figurine"/"anime" not bare "figure"
 * which is a substring of "configure"). A tracked-store match still wins
 * outright — a real "JB Hi-Fi" deal stays on top even if the title also
 * mentions a penalised term.
 */
export const TOP_DEAL_NEGATIVE_KEYWORDS = [
  // Collectibles / anime
  "anime",
  "manga",
  "figurine",
  "funko",
  "collectible",
  "plush toy",
  "trading card",
  // Random gaming pre-orders / digital game keys
  "pre-order",
  "preorder",
  "steam key",
  "game key",
  "download code",
  "nintendo eshop",
  // Liquor / alcohol
  "liquor",
  "alcohol",
  "whisky",
  "whiskey",
  "vodka",
  "mezcal",
  "tequila",
  "wine",
  "champagne",
  "spirits",
  // Low-value grocery snacks
  "confectionery",
  "lollies",
  "chocolate",
  "snack",
  // In-store-only clearance
  "in-store only",
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
  return name
    .toLowerCase()
    .replace(/\s+(au|australia)$/, "")
    .trim();
}

/** First tracked store named in the haystack, or null. */
export function matchStoreName(
  haystack: string,
  stores: StoreRef[],
): string | null {
  for (const store of stores) {
    const needle = storeNeedle(store.name);
    if (needle && haystack.includes(needle)) return store.name;
  }
  return null;
}

/**
 * Count of distinct useful keywords present in the haystack — across both the
 * loyalty/store keywords and the high-priority category keywords.
 */
export function countKeywordHits(haystack: string): number {
  return POSITIVE_KEYWORDS.reduce(
    (n, kw) => (haystack.includes(kw) ? n + 1 : n),
    0,
  );
}

/** Count of distinct broad/unrelated category terms present in the haystack. */
export function countNegativeHits(haystack: string): number {
  return TOP_DEAL_NEGATIVE_KEYWORDS.reduce(
    (n, kw) => (haystack.includes(kw) ? n + 1 : n),
    0,
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
  negativeHits: number;
  /** Net relevance: useful keyword hits minus broad/unrelated penalties. */
  relevanceScore: number;
  ts: number;
  checkedTs: number;
  confirmedCurrent: boolean;
}

function score(item: RankableFeedItem, stores: StoreRef[]): Scored {
  const haystack =
    `${item.title} ${item.summary} ${item.categories.join(" ")}`.toLowerCase();
  const keywordHits = countKeywordHits(haystack);
  const negativeHits = countNegativeHits(haystack);
  return {
    item,
    matchedStoreName: matchStoreName(haystack, stores),
    keywordHits,
    negativeHits,
    relevanceScore: keywordHits - negativeHits,
    ts: recencyMs(item),
    checkedTs: item.lastCheckedAt ? Date.parse(item.lastCheckedAt) || 0 : 0,
    confirmedCurrent: item.expiryDate !== null,
  };
}

function relevanceOf(s: Scored): Relevance {
  if (s.matchedStoreName) return "high";
  if (s.relevanceScore >= 1) return "medium";
  return "low";
}

/**
 * Rank staged items and return the top `limit` as public DTOs. Pure: callers
 * pass in the already-filtered candidate items (no ignored/duplicate) and the
 * tracked stores. Sort is by store match, then keyword hits, then recency.
 */
export function merchantDiverseSelection<T>(
  ranked: T[],
  merchantKey: (item: T) => string | null,
  limit: number,
  merchantCap = 2,
): T[] {
  const target = Math.max(0, limit);
  if (target === 0) return [];

  const selected: T[] = [];
  const selectedItems = new Set<T>();
  const counts = new Map<string, number>();
  const keyFor = (item: T, index: number) =>
    merchantKey(item)?.trim().toLowerCase() || `unknown:${index}`;

  // First pass: best-ranked entry for each known merchant (unknown merchants
  // stay distinct because there is no evidence they are the same retailer).
  const seen = new Set<string>();
  ranked.forEach((item, index) => {
    if (selected.length >= target) return;
    const key = keyFor(item, index);
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(item);
    selectedItems.add(item);
    counts.set(key, 1);
  });

  // Second pass: preserve original rank while respecting the normal cap.
  ranked.forEach((item, index) => {
    if (selected.length >= target || selectedItems.has(item)) return;
    const key = keyFor(item, index);
    if ((counts.get(key) ?? 0) >= merchantCap) return;
    selected.push(item);
    selectedItems.add(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  // Sparse datasets may contain only one or two merchants. Fill truthfully
  // rather than inventing diversity or returning an unnecessarily short feed.
  ranked.forEach((item) => {
    if (selected.length >= target || selectedItems.has(item)) return;
    selected.push(item);
    selectedItems.add(item);
  });

  return selected;
}

export function rankTopDeals(
  items: RankableFeedItem[],
  stores: StoreRef[],
  limit = 5,
): TopDeal[] {
  const scored = items.map((item) => score(item, stores));
  scored.sort((a, b) => {
    if (a.confirmedCurrent !== b.confirmedCurrent) {
      return Number(b.confirmedCurrent) - Number(a.confirmedCurrent);
    }
    if (a.checkedTs !== b.checkedTs) return b.checkedTs - a.checkedTs;
    const aStore = a.matchedStoreName ? 1 : 0;
    const bStore = b.matchedStoreName ? 1 : 0;
    if (aStore !== bStore) return bStore - aStore;
    if (a.relevanceScore !== b.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.ts - a.ts;
  });

  const ranked = scored.map((s) => ({
    id: s.item.id,
    title: s.item.title,
    summary: s.item.summary,
    sourceUrl: s.item.link,
    sourceHost: sourceHostFromUrl(s.item.link),
    postedAt: s.item.postedAt,
    fetchedAt: s.item.fetchedAt,
    lastCheckedAt: s.item.lastCheckedAt,
    expiryDate: s.item.expiryDate,
    categories: s.item.categories,
    nativeId: s.item.nativeId,
    relevance: relevanceOf(s),
    matchedStoreName: s.matchedStoreName,
  }));
  return merchantDiverseSelection(
    ranked,
    (deal) => deal.matchedStoreName,
    limit,
  );
}
