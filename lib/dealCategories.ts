/**
 * Shared deal category taxonomy — pure data, no DB, no network.
 *
 * A single source of truth for the broader category vocabulary used across
 * the feed classifier (lib/monitor/feedItemPreference.ts), the homepage
 * ranking (lib/repos/topDealsRanking.ts) and admin queue copy/presets. Each
 * consumer keeps its own matching strategy (the classifier uses whole-word
 * regex with strong/weak-negative overrides; ranking uses substring scoring)
 * — this module only supplies the category ids, display labels and canonical
 * keyword lists so new categories don't drift between the two as they're
 * extended.
 *
 * Existing, already-tuned keyword lists in feedItemPreference.ts and
 * topDealsRanking.ts are NOT retrofitted to import from here — that would
 * risk regressing carefully-tested override behaviour for no benefit. This
 * taxonomy is the source of truth for the newly-added broader categories
 * (credit card bonuses, bank offers, grocery, dining delivery) so future
 * additions to either file stay in sync.
 */

export type DealCategory =
  | "credit_card_bonus"
  | "bank_offer"
  | "cashback"
  | "gift_card"
  | "grocery"
  | "automotive"
  | "electronics"
  | "beauty"
  | "fashion"
  | "household"
  | "dining_delivery"
  | "travel_rewards"
  | "points_rewards";

export const DEAL_CATEGORIES: readonly DealCategory[] = [
  "credit_card_bonus",
  "bank_offer",
  "cashback",
  "gift_card",
  "grocery",
  "automotive",
  "electronics",
  "beauty",
  "fashion",
  "household",
  "dining_delivery",
  "travel_rewards",
  "points_rewards",
];

/** Human-readable display labels — used for admin queue preset chips/copy. */
export const DEAL_CATEGORY_LABELS: Record<DealCategory, string> = {
  credit_card_bonus: "Credit cards",
  bank_offer: "Bank offers",
  cashback: "Cashback",
  gift_card: "Gift cards",
  grocery: "Grocery",
  automotive: "Automotive",
  electronics: "Electronics",
  beauty: "Beauty",
  fashion: "Fashion",
  household: "Household",
  dining_delivery: "Dining delivery",
  travel_rewards: "Travel rewards",
  points_rewards: "Points & rewards",
};

/**
 * Canonical keyword list per category (lowercased). Consumers compose these
 * into their own matcher (whole-word regex, substring score, etc.) — this
 * module does no matching itself.
 */
export const DEAL_CATEGORY_KEYWORDS: Record<DealCategory, readonly string[]> = {
  credit_card_bonus: [
    "credit card",
    "sign-up bonus",
    "signup bonus",
    "annual fee",
    "card offer",
  ],
  bank_offer: [
    "cba",
    "commbank",
    "commonwealth bank",
    "nab",
    "anz",
    "westpac",
    "amex",
    "american express",
    "statement credit",
    "bank offer",
  ],
  cashback: ["cashback", "shopback", "topcashback"],
  gift_card: ["gift card", "voucher", "store credit"],
  grocery: ["grocery", "groceries", "supermarket", "coles", "woolworths"],
  automotive: [
    "automotive",
    "tyre",
    "tyres",
    "motor oil",
    "engine oil",
    "vehicle",
  ],
  electronics: [
    "electronics",
    "electrical",
    "laptop",
    "phone",
    "tv",
    "headphones",
    "earbuds",
    "camera",
    "tablet",
    "appliance",
    "appliances",
  ],
  beauty: [
    "perfume",
    "fragrance",
    "beauty",
    "skincare",
    "grooming",
    "cosmetic",
    "makeup",
  ],
  fashion: ["fashion", "clothing", "apparel", "shoes", "sneakers", "footwear"],
  household: ["household", "homeware", "furniture", "kitchen", "cookware", "tools"],
  dining_delivery: ["uber eats", "doordash", "menulog", "deliveroo"],
  travel_rewards: ["qantas", "velocity", "frequent flyer"],
  points_rewards: [
    "points",
    "bonus points",
    "flybuys",
    "everyday rewards",
  ],
};
