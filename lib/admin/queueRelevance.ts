import { stores } from "@/lib/data";
import { findMerchantIdInText } from "@/lib/sources/normalise";
// Pure (no DB/network) category keyword list, shared with the homepage Top 5
// ranking so the queue's relevance hint prefers the same priority categories.
import { CATEGORY_PRIORITY_KEYWORDS } from "@/lib/repos/topDealsRanking";

const STORE_NAME_BY_ID = new Map(stores.map((s) => [s.id, s.name]));

/** High-value cues: our core deal types + the points programmes we track. */
const HIGH_RELEVANCE_KEYWORDS = [
  "gift card",
  "giftcard",
  "cashback",
  "cash back",
  "points",
  "qantas",
  "velocity",
  "flybuys",
  "everyday rewards",
  "frequent flyer",
];

/** Generic retail/deal cues: relevant category, but not a tracked store/type. */
const MEDIUM_RELEVANCE_KEYWORDS = [
  "discount",
  "deal",
  "sale",
  "clearance",
  "coupon",
  "promo",
  "voucher",
  "bonus",
  "% off",
  "percent off",
  "bundle",
  "catalogue",
  "price drop",
  "rrp",
];

export type Relevance = "high" | "medium" | "low";

/**
 * A heuristic, read-only review hint for one staged item:
 *   - suggestedMerchant: the tracked store auto-detected in the TITLE (mirrors
 *     what the import action would set), via the existing normalise helper;
 *   - relevance: High when a tracked store is mentioned anywhere or a core
 *     keyword (gift card / cashback / points / Qantas / Velocity …) is present;
 *     Medium for generic retail/deal cues; Low otherwise.
 * It NEVER imports, rejects, or changes any state — it only helps the admin
 * decide faster.
 */
export function assessFeedItem(item: {
  rawTitle: string;
  rawSummary: string;
  categories: string[];
}): {
  suggestedMerchant: string | null;
  relevance: Relevance;
} {
  const haystack =
    `${item.rawTitle} ${item.rawSummary} ${item.categories.join(" ")}`.toLowerCase();
  // Title-only match mirrors the import action's auto-suggested merchant.
  const titleMerchantId = findMerchantIdInText(item.rawTitle);
  const suggestedMerchant = titleMerchantId
    ? STORE_NAME_BY_ID.get(titleMerchantId) ?? null
    : null;
  // Relevance considers the whole item (a tracked store mentioned anywhere counts).
  const mentionsTrackedStore = findMerchantIdInText(haystack) != null;

  let relevance: Relevance;
  if (
    mentionsTrackedStore ||
    HIGH_RELEVANCE_KEYWORDS.some((k) => haystack.includes(k)) ||
    // High-priority deal categories (tech, fashion, beauty, automotive, home …)
    CATEGORY_PRIORITY_KEYWORDS.some((k) => haystack.includes(k))
  ) {
    relevance = "high";
  } else if (MEDIUM_RELEVANCE_KEYWORDS.some((k) => haystack.includes(k))) {
    relevance = "medium";
  } else {
    relevance = "low";
  }
  return { suggestedMerchant, relevance };
}
