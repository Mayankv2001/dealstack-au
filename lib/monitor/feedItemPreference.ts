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

import { DEAL_CATEGORY_KEYWORDS } from "@/lib/dealCategories";

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

/**
 * Strong preferred REWARDS/LOYALTY signals — points, cashback, gift cards and
 * named loyalty programmes. A match here means the deal is a rewards/savings
 * deal, so it wins even when incidental travel/dining wording ("Travel Fund",
 * "dining credit") also appears (see WEAK_NON_PREFERRED_KEYWORDS below). It
 * does NOT rescue a genuinely off-theme category — see STRONG_NON_PREFERRED_KEYWORDS.
 */
export const REWARDS_SIGNAL_KEYWORDS = [
  ...new Set([
    "qantas",
    "velocity",
    "flybuys",
    "everyday rewards",
    "points",
    "bonus points",
    "frequent flyer",
    "cashback",
    "gift card",
    "voucher",
    "store credit",
    "amex",
    "american express",
    // Broader expansion: credit card sign-up bonuses, named bank offers, the
    // two permitted cashback portals, named dining-delivery platforms and
    // generic grocery wording — see docs/source-expansion-strategy.md. These
    // stay in the REWARDS bucket (not PREFERRED_CATEGORY_KEYWORDS) rather
    // than always-win category signals: OzBargain tags many off-theme items
    // (e.g. protein supplements) under its generic "Groceries" category, so a
    // grocery/platform match should rescue a weak negative (dining/travel
    // wording) but must NOT rescue a genuinely off-theme strong negative like
    // a supplement or alcohol deal that merely carries a "Groceries" tag.
    ...DEAL_CATEGORY_KEYWORDS.credit_card_bonus,
    ...DEAL_CATEGORY_KEYWORDS.bank_offer,
    ...DEAL_CATEGORY_KEYWORDS.grocery,
    ...DEAL_CATEGORY_KEYWORDS.dining_delivery,
    "shopback",
    "topcashback",
  ]),
] as const;

/**
 * Weak non-preferred wording — travel/dining terms that are only incidental
 * flavour text on a lot of rewards deals ("$500 Travel Fund", "dining
 * credit"). A rewards signal overrides these (see REWARDS_SIGNAL_KEYWORDS),
 * but on their own (a plain airfare/hotel/dining deal) they still ignore.
 */
export const WEAK_NON_PREFERRED_KEYWORDS = [
  // dining / restaurants
  "restaurant",
  "dining",
  "takeaway",
  // travel
  "flight",
  "flights",
  "airfare",
  "hotel",
  "travel",
] as const;

/**
 * Strong non-preferred CATEGORIES — genuinely off-theme deals. A rewards
 * signal does NOT rescue these (e.g. "bonus points" on a Funko figurine is
 * still a collectible, not a rewards deal).
 */
export const STRONG_NON_PREFERRED_KEYWORDS = [
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
  // pets
  "pet",
  "pets",
  "dog food",
  "cat food",
] as const;

/** All non-preferred keywords (strong + weak) — kept for callers that just want the full list. */
export const NON_PREFERRED_KEYWORDS = [
  ...STRONG_NON_PREFERRED_KEYWORDS,
  ...WEAK_NON_PREFERRED_KEYWORDS,
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
const REWARDS_MATCHERS = REWARDS_SIGNAL_KEYWORDS.map(wordMatcher);
const WEAK_NEGATIVE_MATCHERS = WEAK_NON_PREFERRED_KEYWORDS.map(wordMatcher);
const STRONG_NEGATIVE_MATCHERS = STRONG_NON_PREFERRED_KEYWORDS.map(wordMatcher);

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
 *      makes it preferred — even if a negative word is also present. This
 *      is the "preferred category overrides a negative" case.
 *   2. A REWARDS/LOYALTY signal (Qantas, Velocity, Flybuys, points, cashback,
 *      Amex …) makes it preferred, even if weak travel/dining wording is also
 *      present ("$500 Travel Fund" on an Amex Qantas card is still a points
 *      deal). It does NOT rescue a genuinely off-theme STRONG negative
 *      (alcohol/pets/anime/supplements/snacks/gaming pre-orders).
 *   3. Otherwise, any remaining non-preferred match (strong or weak) with no
 *      preferred category makes it non_preferred. A bare preferred STORE does
 *      NOT rescue a non-preferred category item (e.g. "mezcal @ Costco" is
 *      still alcohol → non_preferred).
 *   4. A preferred store match with no negatives is preferred.
 *   5. Anything unclear is uncertain (and the monitor keeps it as 'new').
 */
export function classifyFeedItemPreference(
  item: PreferenceInput
): FeedItemPreference {
  const haystack = haystackOf(item);
  const hasCategory = anyMatch(haystack, CATEGORY_MATCHERS);
  const hasStore = anyMatch(haystack, STORE_MATCHERS);
  const hasRewards = anyMatch(haystack, REWARDS_MATCHERS);
  const hasStrongNegative = anyMatch(haystack, STRONG_NEGATIVE_MATCHERS);
  const hasWeakNegative = anyMatch(haystack, WEAK_NEGATIVE_MATCHERS);

  // 1. A preferred category always wins (overrides an incidental negative word).
  if (hasCategory) return "preferred";
  // 2. A rewards/loyalty signal wins over weak travel/dining wording, but not
  //    over a genuinely off-theme strong negative.
  if (hasRewards && !hasStrongNegative) return "preferred";
  // 3. A clear non-preferred signal with no preferred category and no rewards
  //    rescue → ignore. A bare store name does not rescue it (alcohol/anime
  //    from a tracked store is still off-theme).
  if (hasStrongNegative || hasWeakNegative) return "non_preferred";
  // 4. A preferred store with no negatives is worth reviewing.
  if (hasStore) return "preferred";
  // 5. No signal either way — keep it for review rather than dropping it.
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
