import { findMerchantIdInText } from "@/lib/sources/normalise";
import { parseRateValue, type DetectedOffer } from "./offerChanges";

/**
 * Offer-change detection heuristics — PURE / OFFLINE ONLY (no network, no DB).
 *
 * Turns a single staged feed item's text into zero or one `DetectedOffer`,
 * conservatively. Precision beats recall by design: every emitted detection is
 * a human review cost in /admin/offer-changes, so a detection is produced ONLY
 * when a provider/source AND a numeric value are both present — plus, for
 * cashback/gift_card/points, a known merchant (card offers are the one type
 * not merchant-scoped; see detectCardOffer's own bar). The output feeds
 * `buildOfferChangeCandidates` + `dedupeOfferChangeCandidates` (in
 * ./offerChanges) unchanged — this module only decides WHAT counts as a
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

/**
 * AU credit-card issuers this module recognises, keyed by matched keyword →
 * canonical provider name. Canonical names mirror the values already used in
 * `card_offers.provider` (migration 007/009 seed rows: American Express,
 * ANZ, Commonwealth Bank, NAB, Westpac) and lib/dealCategories.ts's
 * `bank_offer` keyword list, so a resolved provider name can be matched
 * straight against live `card_offers` rows without a second translation
 * step. This module is PURE / OFFLINE — it cannot query live `card_offers`
 * rows for a dynamic allowlist, so the list is hand-curated here instead,
 * the same way CASHBACK_PROVIDERS and POINTS_PROGRAM_KEYWORDS are.
 */
const CARD_ISSUERS: readonly { keyword: string; name: string }[] = [
  { keyword: "american express", name: "American Express" },
  { keyword: "amex", name: "American Express" },
  { keyword: "commonwealth bank", name: "Commonwealth Bank" },
  { keyword: "commbank", name: "Commonwealth Bank" },
  { keyword: "cba", name: "Commonwealth Bank" },
  { keyword: "anz", name: "ANZ" },
  { keyword: "nab", name: "NAB" },
  { keyword: "westpac", name: "Westpac" },
  { keyword: "bankwest", name: "Bankwest" },
  { keyword: "st.george", name: "St.George" },
  { keyword: "st george", name: "St.George" },
  { keyword: "bank of melbourne", name: "Bank of Melbourne" },
  { keyword: "banksa", name: "BankSA" },
  { keyword: "hsbc", name: "HSBC" },
  { keyword: "citi", name: "Citi" },
  { keyword: "ing", name: "ING" },
  { keyword: "macquarie", name: "Macquarie" },
  { keyword: "suncorp", name: "Suncorp" },
  { keyword: "qantas money", name: "Qantas Money" },
  { keyword: "latitude", name: "Latitude" },
  { keyword: "virgin money", name: "Virgin Money" },
];

// A percentage ("12%", "6.5 %") and a points multiplier ("20x", "3 x").
const PERCENT_RE = /(\d+(?:\.\d+)?)\s*%/;
const MULTIPLIER_RE = /(\d+(?:\.\d+)?)\s*x\b/i;
const GIFT_CARD_RE = /\bgift\s+cards?\b/i;
// Any mention → hard skip (see module doc). Word-bound is unnecessary: the whole
// token only ever appears as the portal name we must not detect.
const CASHREWARDS_RE = /cashrewards/i;

// Card sign-up bonus points: comma-grouped ("190,000 Points") or the "k"
// shorthand OzBargain titles commonly use ("190k Qantas Points").
const POINTS_BONUS_COMMA_RE = /(\d{1,3}(?:,\d{3})+)\s*(?:bonus\s*)?points?\b/i;
const POINTS_BONUS_K_RE =
  /(\d{1,4})\s*k\s*(?:bonus\s*)?(?:qantas\s*|velocity\s*)?points?\b/i;
// Annual fee, e.g. "$450 Ann Fee", "$0 annual fee", "$395 p.a. fee".
const ANNUAL_FEE_RE =
  /\$\s*(\d{1,4}(?:\.\d{2})?)\s*(?:ann(?:ual)?\.?\s*fee|p\.?a\.?\s*fee)/i;

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
const CARD_ISSUER_MATCHERS = CARD_ISSUERS.map((c) => ({
  name: c.name,
  re: wordBound(c.keyword),
}));
const CARD_WORD_RE = wordBound("card");
const CREDIT_CARD_RE = /\bcredit\s+cards?\b/i;

/** Format a matched number with its unit, e.g. "12%" or "20x". */
function withUnit(numeric: string, unit: "%" | "x"): string {
  return `${numeric}${unit}`;
}

/** "190,000 points" -> 190000, or "190k points"/"190k Qantas Points" -> 190000. */
function extractCardBonusPoints(text: string): number | null {
  const comma = text.match(POINTS_BONUS_COMMA_RE);
  if (comma) {
    const n = Number(comma[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const k = text.match(POINTS_BONUS_K_RE);
  if (k) {
    const n = Number(k[1]) * 1000;
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** "$450 Ann Fee" / "$0 annual fee" -> 450 / 0. */
function extractAnnualFee(text: string): number | null {
  const match = text.match(ANNUAL_FEE_RE);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Card offer detection — NOT merchant-scoped (card_offers has no store FK,
 * unlike cashback/gift_card/points), so this runs independently of the
 * merchant gate in detectOffersFromItem below. Emits a detection ONLY when a
 * known issuer, explicit credit-card context, AND (a bonus-points number OR an
 * annual-fee amount) are ALL present. A feed category of "Credit Cards" plus
 * the word "card" is accepted as equivalent context; a generic bank card or a
 * gift card is not. This keeps debit-card and loyalty-points posts out.
 */
function detectCardOffer(
  item: FeedItemView,
  haystack: string
): DetectedOffer | null {
  const issuer = CARD_ISSUER_MATCHERS.find((i) => i.re.test(haystack));
  const categoryText = item.categories.join(" ");
  const hasCardContext =
    CREDIT_CARD_RE.test(haystack) ||
    (/\bcredit\s+cards?\b/i.test(categoryText) && CARD_WORD_RE.test(haystack));
  if (!issuer || !hasCardContext) return null;

  const bonusPoints = extractCardBonusPoints(haystack);
  const annualFee = extractAnnualFee(haystack);
  if (bonusPoints === null && annualFee === null) return null;

  const proposedValue =
    bonusPoints !== null ? `${bonusPoints}pts` : `$${annualFee}`;
  return {
    sourceType: "card_offer",
    sourceName: issuer.name,
    merchantId: null,
    detectedTitle: item.rawTitle,
    detectedUrl: item.link,
    rawSummary: item.rawSummary,
    confidence: "needs-verification",
    targetId: null,
    previousValue: null,
    detectedRateOrDiscount: proposedValue,
    proposedValue,
    payload: {
      provider: issuer.name,
      bonusPoints,
      annualFee,
    },
  };
}

/**
 * Detect at most one offer change from a single feed item.
 *
 * cashback / gift_card / points each require ALL of:
 *  1. a provider/source is explicitly identifiable (portal, "gift card", or a
 *     named points programme);
 *  2. a merchant resolves from the title (findMerchantIdInText);
 *  3. the numeric value parses (parseRateValue).
 *
 * Precedence among those three is cashback → gift_card → points (first full
 * match wins), unchanged from before card-offer detection was added. No
 * `promo`-type detection in v1 — store-wide discount_percent is too noisy to
 * infer from a title. `targetId` / `previousValue` are left null here; a target
 * (and the reviewer-facing previous value) is resolved later, against our own
 * offer rows, in runDetection.
 *
 * `card_offer` is checked last and is the one type NOT gated on a resolved
 * merchant (card_offers has no store FK) — see detectCardOffer's doc for its
 * own "issuer AND card AND value" precision bar. It only runs when none of
 * the three merchant-scoped types already matched.
 */
export function detectOffersFromItem(item: FeedItemView): DetectedOffer[] {
  const haystack = `${item.rawTitle} ${item.rawSummary}`;

  // Hard skip: any Cashrewards mention yields no detection, whatever else matches.
  if (CASHREWARDS_RE.test(haystack)) return [];

  const merchantId = findMerchantIdInText(item.rawTitle);
  if (merchantId) {
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
  }

  // 4. Card offer — see detectCardOffer's doc comment for its own conditions.
  const cardOffer = detectCardOffer(item, haystack);
  return cardOffer ? [cardOffer] : [];
}
