/**
 * Preferred-category classifier for staged OzBargain feed items — OFFLINE ONLY.
 *
 * No network, no DB, no env. Given a mapped feed item (title + summary +
 * categories), it decides whether the deal is in one of the categories we want
 * to review ("preferred"), one we want to skip ("non_preferred"), or unclear
 * ("uncertain"). The monitor uses this to choose the INITIAL review_state of a
 * newly-staged feed_items row:
 *
 *   preferred     → review_state 'new'      (stays in the review queue)
 *   uncertain     → review_state 'new'      (kept for review — we never drop)
 *   non_preferred → review_state 'ignored'  (saved for audit, hidden from queue)
 *
 * It NEVER deletes, imports, or publishes anything — it only picks 'new' vs
 * 'ignored' at insert time. Existing rows are never reclassified (the upsert
 * ignores conflicts), so this only affects future monitor runs.
 *
 * Matching is whole-word and case-insensitive (so "car" does not match "card",
 * "pet" does not match "petrol", "gin" does not match "engine"). Multi-word and
 * hyphenated phrases ("motor oil", "pre-order", "jb hi-fi") match literally.
 */

export type FeedItemPreference = "preferred" | "non_preferred" | "uncertain";

/** The minimal shape the classifier needs — a FeedItemInsert satisfies this. */
export interface PreferenceInput {
  raw_title: string;
  raw_summary: string;
  categories: string[];
}

// ── Keyword lists ────────────────────────────────────────────────────────────

/** Preferred STORES — a tracked retailer named in the item is a positive signal. */
export const PREFERRED_STORE_KEYWORDS = [
  "costco",
  "jb hi-fi",
  "officeworks",
  "amazon",
  "myer",
  "chemist warehouse",
  "the good guys",
  "coles",
  "woolworths",
  "kogan",
  "bunnings",
] as const;

/** Preferred CATEGORIES — tech, fashion, gift cards, beauty, automotive, home. */
export const PREFERRED_CATEGORY_KEYWORDS = [
  // tech / electronics / appliances
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
  "camera",
  "monitor",
  "tablet",
  "appliance",
  "appliances",
  "refrigerator",
  "fridge",
  "washing machine",
  "dryer",
  "dishwasher",
  "vacuum",
  "air fryer",
  "coffee machine",
  // clothing / fashion / footwear
  "fashion",
  "clothing",
  "shoes",
  "sneakers",
  "apparel",
  "jacket",
  "footwear",
  // gift cards / vouchers
  "gift card",
  "voucher",
  // perfume / beauty / grooming
  "perfume",
  "fragrance",
  "beauty",
  "skincare",
  "grooming",
  "cosmetic",
  "makeup",
  // automotive
  "automotive",
  "tyre",
  "tyres",
  "car",
  "motor oil",
  "engine oil",
  "vehicle",
  // household / home goods / tools / DIY
  "home",
  "household",
  "homeware",
  "furniture",
  "kitchen",
  "cookware",
  "cleaning",
  "tools",
  "tool",
  "diy",
] as const;

/** Non-preferred CATEGORIES — to be auto-ignored when no preferred signal wins. */
export const NON_PREFERRED_KEYWORDS = [
  // alcohol / liquor
  "alcohol",
  "liquor",
  "wine",
  "beer",
  "whisky",
  "whiskey",
  "gin",
  "mezcal",
  "tequila",
  "vodka",
  "champagne",
  "spirits",
  // anime / collectibles / toys
  "anime",
  "manga",
  "figurine",
  "funko",
  "collectible",
  "plush toy",
  "trading card",
  // gaming pre-orders / digital game keys
  "pre-order",
  "preorder",
  "steam key",
  "game key",
  "download code",
  "nintendo eshop",
  // low-value grocery snacks
  "grocery snack",
  "snack",
  "snacks",
  "chips",
  "chocolate",
  "lollies",
  "confectionery",
  // supplements / vitamins
  "supplement",
  "supplements",
  "vitamin",
  "vitamins",
  "protein powder",
  // dining / restaurants
  "restaurant",
  "dining",
  "takeaway",
  // pets
  "pet",
  "pets",
  "dog food",
  "cat food",
  // travel
  "flight",
  "flights",
  "hotel",
  "travel",
] as const;

// ── Matching ─────────────────────────────────────────────────────────────────

/** Build a whole-word, case-insensitive matcher for one keyword/phrase. */
function wordMatcher(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Bounded by start/end or any non-alphanumeric char on each side, so "car"
  // matches "car" but not "card"/"scarf", and "pre-order" matches literally.
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
}

const STORE_MATCHERS = PREFERRED_STORE_KEYWORDS.map(wordMatcher);
const CATEGORY_MATCHERS = PREFERRED_CATEGORY_KEYWORDS.map(wordMatcher);
const NEGATIVE_MATCHERS = NON_PREFERRED_KEYWORDS.map(wordMatcher);

function anyMatch(haystack: string, matchers: RegExp[]): boolean {
  return matchers.some((re) => re.test(haystack));
}

/** Lowercased title + summary + categories — the text the rules run against. */
function haystackOf(item: PreferenceInput): string {
  return `${item.raw_title} ${item.raw_summary} ${item.categories.join(" ")}`.toLowerCase();
}

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Classify a feed item by category preference.
 *
 * Rules (in order):
 *   1. A preferred CATEGORY match (laptop, sneaker, fragrance, tyre, cookware …)
 *      makes it preferred — even if a weak negative word is also present. This
 *      is the "preferred store/category overrides a weak negative" case.
 *   2. Otherwise, a clear non-preferred match with NO preferred category makes
 *      it non_preferred. A bare preferred STORE does NOT rescue a non-preferred
 *      category item (e.g. "mezcal @ Costco" is still alcohol → non_preferred).
 *   3. A preferred store match with no negatives is preferred.
 *   4. Anything unclear is uncertain (and the monitor keeps it as 'new').
 */
export function classifyFeedItemPreference(
  item: PreferenceInput
): FeedItemPreference {
  const haystack = haystackOf(item);
  const hasCategory = anyMatch(haystack, CATEGORY_MATCHERS);
  const hasStore = anyMatch(haystack, STORE_MATCHERS);
  const hasNegative = anyMatch(haystack, NEGATIVE_MATCHERS);

  // 1. A preferred category always wins (overrides an incidental negative word).
  if (hasCategory) return "preferred";
  // 2. A clear non-preferred signal with no preferred category → ignore. A bare
  //    store name does not rescue it (alcohol/anime from a tracked store is
  //    still off-theme).
  if (hasNegative) return "non_preferred";
  // 3. A preferred store with no negatives is worth reviewing.
  if (hasStore) return "preferred";
  // 4. No signal either way — keep it for review rather than dropping it.
  return "uncertain";
}

/**
 * The review_state a freshly-staged item should get from its preference:
 * non_preferred → 'ignored'; preferred / uncertain → 'new'. This is the only
 * place the monitor's auto-ignore decision is made.
 */
export function feedItemReviewState(item: PreferenceInput): "new" | "ignored" {
  return classifyFeedItemPreference(item) === "non_preferred" ? "ignored" : "new";
}
