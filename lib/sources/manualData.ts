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
 * Today's reference date for samples: June 2026.
 */

// ─── OzBargain — discount code / community deal examples ───────────────
export const ozbargainResults: DealSourceResult[] = [
  {
    id: "ozb-myer-10-code",
    source: "ozbargain",
    kind: "discount-code",
    title: "10% off sitewide at Myer with code",
    merchant: "Myer",
    merchantId: "myer",
    summary:
      "Sample community-posted code MYER10 for 10% off most full-priced items online. Exclusions apply.",
    discountPercent: 10,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: "2026-09-30",
    startDate: "2026-06-10",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    publishedAt: "2026-06-10",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
    confidence: "confirmed",
  },
  {
    id: "ozb-kogan-10-code",
    source: "ozbargain",
    kind: "discount-code",
    title: "Kogan 10% off code for app users",
    merchant: "Kogan",
    merchantId: "kogan",
    summary:
      "Sample app-only code KOGAN10 for 10% off selected categories. Short-dated flash promo.",
    discountPercent: 10,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: "2026-09-21",
    startDate: "2026-06-14",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    publishedAt: "2026-06-11",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
    confidence: "confirmed",
  },
  {
    id: "ozb-jbhifi-perks",
    source: "ozbargain",
    kind: "discount-code",
    title: "JB Hi-Fi 5% off for Perks members",
    merchant: "JB Hi-Fi",
    merchantId: "jb-hifi",
    summary:
      "Sample JB Perks member offer: 5% off selected tech with code PERKS5. Expiry not stated in post.",
    discountPercent: 5,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: null,
    startDate: null,
    sourceUrl: "https://www.ozbargain.com.au/deals",
    publishedAt: "2026-06-08",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
    confidence: "needs-verification",
  },
  {
    id: "ozb-goodguys-expired",
    source: "ozbargain",
    kind: "discount-code",
    title: "The Good Guys 5% off June flash sale",
    merchant: "The Good Guys",
    merchantId: "the-good-guys",
    summary:
      "Sample flash promo GOODGUYS5 for 5% off appliances. Ended at the start of June.",
    discountPercent: 5,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: "2026-06-01",
    startDate: "2026-05-25",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    publishedAt: "2026-05-25",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
    confidence: "confirmed",
  },
];

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
    publishedAt: "2026-06-01",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    expiryDate: "2026-09-30",
    startDate: "2026-06-01",
    sourceUrl: "https://www.pointhacks.com.au",
    publishedAt: "2026-06-02",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    expiryDate: "2026-09-16",
    startDate: "2026-06-10",
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: "2026-06-10",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    expiryDate: "2026-09-23",
    startDate: "2026-06-09",
    sourceUrl: "https://www.freepoints.com.au",
    publishedAt: "2026-06-09",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    publishedAt: "2026-06-05",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    publishedAt: "2026-06-07",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    publishedAt: "2026-06-03",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    publishedAt: "2026-06-03",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
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
    expiryDate: "2026-07-31",
    startDate: null,
    sourceUrl: "https://www.gcdb.com.au",
    publishedAt: "2026-06-06",
    lastCheckedAt: "2026-06-25T22:00:00+10:00",
    confidence: "confirmed",
  },
];

// ─── Manual — DealStack admin-verified examples ─────────────────────────
export const manualResults: DealSourceResult[] = [
  {
    // Intentionally overlaps the OzBargain Myer code so the dedupe/merge
    // path is exercised by real data: same merchant, kind and discount.
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
    expiryDate: "2026-09-30",
    startDate: "2026-06-10",
    sourceUrl: "https://www.myer.com.au",
    publishedAt: "2026-06-11",
    lastCheckedAt: "2026-06-25T09:00:00+10:00",
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
    publishedAt: "2026-06-12",
    lastCheckedAt: "2026-06-25T09:00:00+10:00",
    confidence: "confirmed",
  },
];

// ─── Card offers — demo bank/credit-card rows (Illustrative, needs-verification) ─
export const cardResults: DealSourceResult[] = cardOffers.map(cardOfferToSourceResult);

/** Every static sample result across all sources */
export const allSourceResults: DealSourceResult[] = [
  ...ozbargainResults,
  ...pointHacksResults,
  ...freePointsResults,
  ...gcdbResults,
  ...manualResults,
  ...cardResults,
];
