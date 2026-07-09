import { findMerchantIdInText } from "@/lib/sources/normalise";
import { parseRateValue, type DetectedOffer } from "./offerChanges";

/**
 * Offer-change detection heuristics — PURE / OFFLINE ONLY (no network, no DB).
 *
 * Turns a single staged feed item's text into zero or one `DetectedOffer`,
 * conservatively. Precision beats recall by design: every emitted detection is
 * a human review cost in /admin/offer-changes, so a detection is produced ONLY
 * when a provider/source, a numeric value AND a known merchant are all present.
 * The output feeds `buildOfferChangeCandidates` + `dedupeOfferChangeCandidates`
 * (in ./offerChanges) unchanged — this module only decides WHAT counts as a
 * detection, never how it is staged or applied.
 *
 * Nothing here fetches, scrapes, or writes. Cashrewards is never detected: a
 * title mentioning it is hard-skipped (permitted portals are ShopBack and
 * TopCashback only — see docs/cashback-portal-policy.md).
 */

/** The minimal view of a staged `feed_items` row detection needs. */
export interface FeedItemView {
  rawTitle: string;
  rawSummary: string;
  link: string;
  categories: string[];
}

/**
 * Permitted cashback portals (keyword → canonical casing). ShopBack and
 * TopCashback ONLY. Cashrewards is deliberately absent and is hard-skipped
 * below — it must never be staged under a different provider.
 */
const CASHBACK_PROVIDERS: readonly { keyword: string; name: string }[] = [
  { keyword: "shopback", name: "ShopBack" },
  { keyword: "topcashback", name: "TopCashback" },
];

/**
 * Named loyalty programmes only — the same four named in the shared taxonomy
 * (DEAL_CATEGORY_KEYWORDS travel_rewards/points_rewards in lib/dealCategories).
 * Generic words like "points" / "frequent flyer" are intentionally excluded: a
 * points detection needs a NAMED programme AND an "Nx" multiplier AND a
 * resolvable merchant, so a bare "points" mention can never fire on its own.
 */
const POINTS_PROGRAM_KEYWORDS = [
  "qantas",
  "velocity",
  "flybuys",
  "everyday rewards",
] as const;

// A percentage ("12%", "6.5 %") and a points multiplier ("20x", "3 x").
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
const MULTIPLIER_RE = /(\d+(?:\.\d+)?)\s*x\b/i;
const GIFT_CARD_RE = /\bgift\s+cards?\b/i;
// Any mention → hard skip (see module doc). Word-bound is unnecessary: the whole
// token only ever appears as the portal name we must not detect.
const CASHREWARDS_RE = /cashrewards/i;

/** Whole-word, case-insensitive matcher (mirrors feedItemPreference's style). */
function wordBound(keyword: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i");
}

const CASHBACK_MATCHERS = CASHBACK_PROVIDERS.map((p) => ({
  name: p.name,
  re: wordBound(p.keyword),
}));
const POINTS_MATCHERS = POINTS_PROGRAM_KEYWORDS.map(wordBound);

/** Format a matched number with its unit, e.g. "12%" or "20x". */
function withUnit(numeric: string, unit: "%" | "x"): string {
  return `${numeric}${unit}`;
}

/**
 * Detect at most one offer change from a single feed item.
 *
 * Emits a `DetectedOffer` ONLY when ALL hold:
 *  1. a provider/source is explicitly identifiable (portal, "gift card", or a
 *     named points programme);
 *  2. a merchant resolves from the title (findMerchantIdInText);
 *  3. the numeric value parses (parseRateValue).
 *
 * Precedence is cashback → gift_card → points (first full match wins). No
 * `promo`-type detection in v1 — store-wide discount_percent is too noisy to
 * infer from a title. `targetId` / `previousValue` are left null here; a target
 * (and the reviewer-facing previous value) is resolved later, against our own
 * offer rows, in runDetection.
 */
export function detectOffersFromItem(item: FeedItemView): DetectedOffer[] {
  const haystack = `${item.rawTitle} ${item.rawSummary}`;

  // Hard skip: any Cashrewards mention yields no detection, whatever else matches.
  if (CASHREWARDS_RE.test(haystack)) return [];

  // Merchant is required for every type — no merchant can ever resolve a target,
  // so a merchant-less detection is pure review noise. Resolve from the title.
  const merchantId = findMerchantIdInText(item.rawTitle);
  if (!merchantId) return [];

  const base = {
    merchantId,
    detectedTitle: item.rawTitle,
    detectedUrl: item.link,
    rawSummary: item.rawSummary,
    confidence: "needs-verification" as const,
    targetId: null,
    previousValue: null,
  };

  // 1. Cashback — a permitted portal AND a percentage.
  const provider = CASHBACK_MATCHERS.find((p) => p.re.test(haystack));
  const percent = haystack.match(PERCENT_RE);
  if (provider && percent) {
    const value = withUnit(percent[1], "%");
    if (parseRateValue(value) !== null) {
      return [
        {
          ...base,
          sourceType: "cashback",
          sourceName: provider.name,
          detectedRateOrDiscount: value,
          proposedValue: value,
        },
      ];
    }
  }

  // 2. Gift card — the phrase "gift card(s)" AND a percentage.
  if (GIFT_CARD_RE.test(haystack) && percent) {
    const value = withUnit(percent[1], "%");
    if (parseRateValue(value) !== null) {
      return [
        {
          ...base,
          sourceType: "gift_card",
          sourceName: "OzBargain",
          detectedRateOrDiscount: value,
          proposedValue: value,
        },
      ];
    }
  }

  // 3. Points — a named programme AND an "Nx" multiplier.
  const hasProgram = POINTS_MATCHERS.some((re) => re.test(haystack));
  const multiplier = haystack.match(MULTIPLIER_RE);
  if (hasProgram && multiplier) {
    const value = withUnit(multiplier[1], "x");
    if (parseRateValue(value) !== null) {
      return [
        {
          ...base,
          sourceType: "points",
          sourceName: "OzBargain",
          detectedRateOrDiscount: value,
          proposedValue: value,
        },
      ];
    }
  }

  return [];
}
