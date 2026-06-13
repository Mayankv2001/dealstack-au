import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  WeeklyDeal,
} from "./types";

/**
 * SAMPLE / STATIC / MANUAL DATA ONLY.
 *
 * Nothing here was scraped, fetched, or copied from any website. Titles and
 * summaries are our own illustrative wording inspired by common Australian
 * weekly-deal patterns. URLs point at source homepages/category pages as
 * placeholders, not at copied articles. There are NO network requests and NO
 * database — these are hand-written examples in the shape real adapters will
 * emit later.
 *
 * Reference "today" for these samples: mid-June 2026.
 * Current sample week: weekOf = "2026-06-08" (Monday).
 *
 * Merchant ids below must match Store.id in lib/data.ts:
 *   myer · jb-hifi · the-good-guys · coles · woolworths · amazon-au ·
 *   kogan · chemist-warehouse
 */

const SAMPLE_CHECKED_AT = "2026-06-12T22:00:00+10:00";
/** Deliberately old, to demonstrate the stale-data warning. */
const STALE_CHECKED_AT = "2026-05-20T22:00:00+10:00";

// ─── Gift card offers ──────────────────────────────────────────────────────
export const giftCardOffers: GiftCardOffer[] = [
  {
    id: "gc-coles-group-bonus-points",
    brand: "Coles Group",
    discountPercent: 0,
    channel: "supermarket-promo",
    source: "Coles in-store promo",
    acceptedAtMerchantIds: ["coles"],
    // The stacking trick: bonus Flybuys for buying the gift card itself.
    pointsOnPurchase: {
      program: "Flybuys",
      earnNote: "Sample: 2,000 bonus Flybuys when you buy $100+ in Coles Group gift cards",
    },
    capDollars: 200,
    expiryDate: "2026-06-30",
    startDate: "2026-06-08",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "gc-ultimate-jbhifi",
    brand: "Ultimate",
    discountPercent: 5,
    channel: "membership-portal",
    source: "RACV Member Benefits",
    // Ultimate / TCN cards are commonly accepted at JB Hi-Fi & The Good Guys.
    acceptedAtMerchantIds: ["jb-hifi", "the-good-guys"],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: "2026-07-15",
    startDate: "2026-06-01",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "confirmed",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "gc-tcn-jbhifi",
    brand: "TCN",
    discountPercent: 4,
    channel: "bank-benefit",
    source: "Suncorp Benefits",
    acceptedAtMerchantIds: ["jb-hifi", "the-good-guys"],
    pointsOnPurchase: null,
    capDollars: 500,
    expiryDate: "2026-06-15", // close to "today" → triggers expiry-soon
    startDate: "2026-06-01",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "gc-apple-points",
    brand: "Apple",
    discountPercent: 0,
    channel: "supermarket-promo",
    source: "Woolworths in-store promo",
    // Apple cards aren't spent at our sample retailers — illustrative only.
    acceptedAtMerchantIds: [],
    pointsOnPurchase: {
      program: "Everyday Rewards",
      earnNote: "Sample: bonus Everyday Rewards points on Apple gift cards this week",
    },
    capDollars: 200,
    expiryDate: "2026-06-24",
    startDate: "2026-06-08",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "gc-restaurant-cafe-choice",
    brand: "Restaurant & Cafe Choice",
    discountPercent: 10,
    channel: "membership-portal",
    source: "NRMA Blue",
    // Merchant-category dining cards — illustrative, not tied to sample retailers.
    acceptedAtMerchantIds: [],
    pointsOnPurchase: null,
    capDollars: 250,
    expiryDate: "2026-07-31",
    startDate: "2026-06-01",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "confirmed",
    lastCheckedAt: STALE_CHECKED_AT, // demonstrates stale-data warning
  },
];

// ─── Cashback offers (ShopBack / TopCashback only) ─────────────────────────
export const cashbackOffers: CashbackOffer[] = [
  {
    id: "cb-shopback-myer",
    merchantId: "myer",
    provider: "ShopBack",
    ratePercent: 6,
    flatAmount: null,
    capDollars: null,
    isUpsized: true,
    excludesGiftCardPayment: true,
    termsSummary:
      "Sample upsized rate on full-priced items; excludes gift card payment and some brands.",
    expiryDate: "2026-06-30",
    citations: [
      { source: "manual", sourceUrl: "https://www.shopback.com.au" },
    ],
    confidence: "confirmed",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "cb-topcashback-chemist-warehouse",
    merchantId: "chemist-warehouse",
    provider: "TopCashback",
    ratePercent: 4,
    flatAmount: null,
    capDollars: null,
    isUpsized: false,
    excludesGiftCardPayment: false,
    termsSummary:
      "Sample standing rate on most categories; track via the cashback portal before checkout.",
    expiryDate: null,
    citations: [
      { source: "manual", sourceUrl: "https://www.topcashback.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── Points offers ─────────────────────────────────────────────────────────
export const pointsOffers: PointsOffer[] = [
  {
    id: "pts-woolworths-20x",
    merchantId: "woolworths",
    program: "Everyday Rewards",
    earnRateDisplay: "20x points per $1 (activated offer)",
    earnMultiple: 20,
    pointValueCents: 0.5, // ~2,000 pts ≈ $10 in sample terms
    mechanism: "in-store-boost",
    expiryDate: "2026-06-17",
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "pts-coles-flybuys-base",
    merchantId: "coles",
    program: "Flybuys",
    earnRateDisplay: "1 point per $1",
    earnMultiple: 1,
    pointValueCents: 0.5,
    mechanism: "base-earn",
    expiryDate: null,
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    confidence: "confirmed",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── OzBargain community signals ───────────────────────────────────────────
export const ozBargainSignals: OzBargainSignal[] = [
  {
    id: "ozb-signal-jbhifi-ultimate",
    merchantId: "jb-hifi",
    title: "Discounted Ultimate gift cards reported working at JB Hi-Fi",
    summary:
      "Sample community thread: members report stacking discounted Ultimate cards on electronics. Verify acceptance in-store.",
    votesSample: 142,
    sentiment: "hot",
    dealKind: "gift-card",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-10",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── Weekly deals (curated view referencing the offers above) ──────────────
export const weeklyDeals: WeeklyDeal[] = [
  {
    id: "wk-2026-06-08-jbhifi-stack",
    weekOf: "2026-06-08",
    merchantId: "jb-hifi",
    title: "Best stack: JB Hi-Fi via discounted Ultimate cards",
    summary:
      "Sample: pair the public PERKS5 code with discounted Ultimate gift cards for a deeper effective discount.",
    highlight: "best-stack",
    componentIds: ["gc-ultimate-jbhifi", "ozb-signal-jbhifi-ultimate"],
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
      { source: "ozbargain", sourceUrl: "https://www.ozbargain.com.au/deals" },
    ],
    expiryDate: "2026-07-15",
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-woolworths-20x",
    weekOf: "2026-06-08",
    merchantId: "woolworths",
    title: "Points boost: 20x Everyday Rewards at Woolworths",
    summary:
      "Sample activated offer — activate in-app before shopping to earn 20x on eligible spend.",
    highlight: "points",
    componentIds: ["pts-woolworths-20x"],
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    expiryDate: "2026-06-17",
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-coles-gc-points",
    weekOf: "2026-06-08",
    merchantId: "coles",
    title: "Gift card bonus: Flybuys when buying Coles Group cards",
    summary:
      "Sample: bonus Flybuys for buying Coles Group gift cards, then spend them on your normal shop.",
    highlight: "gift-card",
    componentIds: ["gc-coles-group-bonus-points", "pts-coles-flybuys-base"],
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    expiryDate: "2026-06-30",
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-myer-cashback",
    weekOf: "2026-06-08",
    merchantId: "myer",
    title: "Cashback boost: upsized ShopBack at Myer",
    summary:
      "Sample upsized ShopBack rate — note it excludes gift card payment, so choose one or the other.",
    highlight: "cashback",
    componentIds: ["cb-shopback-myer"],
    citations: [
      { source: "manual", sourceUrl: "https://www.shopback.com.au" },
    ],
    expiryDate: "2026-06-30",
    confidence: "confirmed",
  },
];

// ─── Convenience lookups (pure, no network) ────────────────────────────────
export function giftCardOffersForMerchant(merchantId: string): GiftCardOffer[] {
  return giftCardOffers.filter((o) =>
    o.acceptedAtMerchantIds.includes(merchantId)
  );
}

export function cashbackOffersForMerchant(merchantId: string): CashbackOffer[] {
  return cashbackOffers.filter((o) => o.merchantId === merchantId);
}

export function pointsOffersForMerchant(merchantId: string): PointsOffer[] {
  return pointsOffers.filter((o) => o.merchantId === merchantId);
}

export function ozBargainSignalsForMerchant(
  merchantId: string
): OzBargainSignal[] {
  return ozBargainSignals.filter((o) => o.merchantId === merchantId);
}
