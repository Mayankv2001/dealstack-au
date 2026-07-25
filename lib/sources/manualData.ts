import { addDaysToIsoDate, todayAU } from "@/lib/offers/expiry";
import { cardOffers } from "@/lib/offers/manualOffers";
import { cardOfferToSourceResult } from "./cardResults";
import type { DealSourceResult } from "./types";

/**
 * EXAMPLE / STATIC DATA ONLY.
 *
 * These are hand-written sample results in the shape that real source
 * adapters will emit later. Nothing here was fetched or copied from any
 * website — titles and summaries are our own illustrative wording, and
 * URLs point to source homepages/category pages as placeholders.
 *
 * Dates are ANCHORED TO TODAY (same convention as lib/offers/manualOffers.ts):
 * expired literals would silently drop rows from the static pipeline as real
 * time passes, changing the demo states CI asserts on.
 */

/** Today's AU calendar date, captured once at module load. */
const TODAY_AU = todayAU();

/** "YYYY-MM-DD" exactly `days` calendar days from today AU (negative = past). */
function sampleDate(days: number): string {
  return addDaysToIsoDate(TODAY_AU, days);
}

/** Sample "checked yesterday evening" timestamp shared by most rows. */
const SAMPLE_CHECKED_AT = `${sampleDate(-1)}T22:00:00+10:00`;
/** Admin-verified rows are checked on a morning pass. */
const MANUAL_CHECKED_AT = `${sampleDate(-1)}T09:00:00+10:00`;

// ─── Point Hacks — points / guide examples ──────────────────────────────
export const pointHacksResults: DealSourceResult[] = [
  {
    id: "ph-qantas-card-guide",
    source: "pointhacks",
    kind: "guide",
    title: "Best Qantas Points credit card sign-up bonuses",
    merchant: null,
    merchantId: null,
    summary:
      "Sample editorial guide comparing current Qantas Points card bonuses across major banks. Rates change often.",
    discountPercent: null,
    pointsProgram: "Qantas",
    pointsAmount: "Up to 100,000 bonus points",
    giftCardBrand: null,
    cardOrProvider: "Various banks",
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.pointhacks.com.au",
    publishedAt: sampleDate(-24),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "needs-verification",
  },
  {
    id: "ph-velocity-transfer",
    source: "pointhacks",
    kind: "points",
    title: "Velocity 15% transfer bonus from bank rewards programs",
    merchant: null,
    merchantId: null,
    summary:
      "Sample promo: 15% bonus when converting eligible bank reward points to Velocity by end of June.",
    discountPercent: null,
    pointsProgram: "Velocity",
    pointsAmount: "15% transfer bonus",
    giftCardBrand: null,
    cardOrProvider: "Eligible bank rewards programs",
    expiryDate: sampleDate(97),
    startDate: sampleDate(-24),
    sourceUrl: "https://www.pointhacks.com.au",
    publishedAt: sampleDate(-23),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "confirmed",
  },
];

// ─── FreePoints — bonus points / loyalty promo examples ────────────────
export const freePointsResults: DealSourceResult[] = [
  {
    id: "fp-flybuys-coles-10x",
    source: "freepoints",
    kind: "points",
    title: "10x Flybuys points on a $50+ shop at Coles",
    merchant: "Coles",
    merchantId: "coles",
    summary:
      "Sample targeted Flybuys offer: activate in the app, spend $50+ in store this week for 10x points.",
    discountPercent: null,
    pointsProgram: "Flybuys",
    pointsAmount: "10x points",
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: sampleDate(83),
    startDate: sampleDate(-15),
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: sampleDate(-15),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "confirmed",
  },
  {
    id: "fp-everyday-woolies-bonus",
    source: "freepoints",
    kind: "points",
    title: "2,000 bonus Everyday Rewards points at Woolworths",
    merchant: "Woolworths",
    merchantId: "woolworths",
    summary:
      "Sample boosted offer: 2,000 bonus points for spending $100+ across two shops. Activation required.",
    discountPercent: null,
    pointsProgram: "Everyday Rewards",
    pointsAmount: "2,000 bonus points",
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: sampleDate(90),
    startDate: sampleDate(-16),
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: sampleDate(-16),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "confirmed",
  },
  {
    id: "fp-qantas-giftcards",
    source: "freepoints",
    kind: "points",
    title: "Bonus Qantas Points on selected gift card purchases",
    merchant: null,
    merchantId: null,
    summary:
      "Sample promo: earn bonus Qantas Points per $1 on selected retailer gift cards bought online.",
    discountPercent: null,
    pointsProgram: "Qantas",
    pointsAmount: "Up to 3 points per $1",
    giftCardBrand: "Selected retailers",
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: sampleDate(-20),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "needs-verification",
  },
  {
    id: "fp-velocity-amazon",
    source: "freepoints",
    kind: "cashback",
    title: "Velocity points instead of cashback at Amazon AU",
    merchant: "Amazon AU",
    merchantId: "amazon-au",
    summary:
      "Sample shop-through offer: earn Velocity points per $1 on eligible Amazon AU categories via the Velocity e-store.",
    discountPercent: null,
    pointsProgram: "Velocity",
    pointsAmount: "2 points per $1",
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: sampleDate(-18),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "needs-verification",
  },
];

// ─── GCDB — gift card discount examples ────────────────────────────────
export const gcdbResults: DealSourceResult[] = [
  {
    id: "gcdb-coles-group-4",
    source: "gcdb",
    kind: "gift-card",
    title: "Coles Group & Myer gift cards 4% off via member programs",
    merchant: "Coles",
    merchantId: "coles",
    summary:
      "Sample listing: Coles Group & Myer gift cards at 4% off face value through RACQ/Suncorp member benefits.",
    discountPercent: 4,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: "Coles Group & Myer",
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.gcdb.com.au",
    publishedAt: sampleDate(-22),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "needs-verification",
  },
  {
    id: "gcdb-wish-5",
    source: "gcdb",
    kind: "gift-card",
    title: "WISH (Woolworths) gift cards 5% off",
    merchant: "Woolworths",
    merchantId: "woolworths",
    summary:
      "Sample listing: WISH eGift cards at 5% off via insurer and employer benefit programs.",
    discountPercent: 5,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: "WISH",
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.gcdb.com.au",
    publishedAt: sampleDate(-22),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "needs-verification",
  },
  {
    id: "gcdb-jbhifi-racv",
    source: "gcdb",
    kind: "gift-card",
    title: "JB Hi-Fi gift cards 5% off for RACV members",
    merchant: "JB Hi-Fi",
    merchantId: "jb-hifi",
    summary:
      "Sample listing: JB Hi-Fi eGift cards at 5% off face value through RACV member benefits.",
    discountPercent: 5,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: "JB Hi-Fi",
    cardOrProvider: null,
    expiryDate: sampleDate(36),
    startDate: null,
    sourceUrl: "https://www.gcdb.com.au",
    publishedAt: sampleDate(-19),
    lastCheckedAt: SAMPLE_CHECKED_AT,
    confidence: "confirmed",
  },
];

// ─── Manual — DealStack admin-verified examples ─────────────────────────
export const manualResults: DealSourceResult[] = [
  {
    id: "man-myer-10-verified",
    source: "manual",
    kind: "discount-code",
    title: "Myer 10% off code verified by DealStack",
    merchant: "Myer",
    merchantId: "myer",
    summary:
      "Sample admin entry: we tested MYER10 at checkout on a full-priced item and it applied correctly.",
    discountPercent: 10,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: sampleDate(97),
    startDate: sampleDate(-15),
    sourceUrl: "https://www.myer.com.au",
    publishedAt: sampleDate(-14),
    lastCheckedAt: MANUAL_CHECKED_AT,
    confidence: "confirmed",
  },
  {
    id: "man-cw-everyday-stack",
    source: "manual",
    kind: "points",
    title: "Chemist Warehouse + Everyday Rewards stack verified",
    merchant: "Chemist Warehouse",
    merchantId: "chemist-warehouse",
    summary:
      "Sample admin entry: confirmed Everyday Rewards points track alongside cashback at Chemist Warehouse online.",
    discountPercent: null,
    pointsProgram: "Everyday Rewards",
    pointsAmount: "1 point per $1",
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.chemistwarehouse.com.au",
    publishedAt: sampleDate(-13),
    lastCheckedAt: MANUAL_CHECKED_AT,
    confidence: "confirmed",
  },
];

// ─── Card offers — demo bank/credit-card rows (Illustrative, needs-verification) ─
export const cardResults: DealSourceResult[] = cardOffers.map(cardOfferToSourceResult);

/** Every static sample result across all sources */
export const allSourceResults: DealSourceResult[] = [
  ...pointHacksResults,
  ...freePointsResults,
  ...gcdbResults,
  ...manualResults,
  ...cardResults,
];
