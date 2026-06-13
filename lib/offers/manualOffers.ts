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
    purchaseLocation: "Coles supermarkets & Coles Online",
    purchaseMethod: "online-and-in-store",
    limitPerCustomer: "Bonus on up to $200 in gift cards (sample)",
    acceptedAt: ["Coles", "Coles Online", "Liquorland", "First Choice Liquor"],
    usageNotes: [
      "Activate the bonus in Flybuys before you buy",
      "Bonus points usually post within a few days",
    ],
    stackNotes: [
      "Stacks on top of your Flybuys base earn",
      "May not combine with other gift card promos",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
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
    purchaseLocation: "RACV Member Benefits portal",
    purchaseMethod: "online",
    limitPerCustomer: "No stated cap (sample)",
    acceptedAt: ["JB Hi-Fi", "The Good Guys", "many Ultimate-network retailers"],
    usageNotes: [
      "Digital cards are delivered by email",
      "Check the balance before paying in-store",
    ],
    stackNotes: [
      "Pair with a public store promo code at checkout",
      "Cashback usually voids when you pay with gift cards",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
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
    purchaseLocation: "Suncorp Benefits portal",
    purchaseMethod: "online",
    limitPerCustomer: "Up to $500 per order (sample)",
    acceptedAt: ["JB Hi-Fi", "The Good Guys"],
    usageNotes: [
      "TCN cards are accepted at many electronics retailers",
      "Confirm acceptance with staff before a big purchase",
    ],
    stackNotes: [
      "Use alongside a store promo code",
      "Buy below face value, then pay full value",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "gc-woolworths-wish",
    brand: "Woolworths WISH",
    discountPercent: 5,
    channel: "membership-portal",
    source: "Suncorp Benefits",
    acceptedAtMerchantIds: ["woolworths"],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: "2026-07-10",
    startDate: "2026-06-01",
    purchaseLocation: "Suncorp Benefits portal",
    purchaseMethod: "online",
    limitPerCustomer: "No stated cap (sample)",
    acceptedAt: ["Woolworths", "BIG W", "BWS", "Caltex Woolworths"],
    usageNotes: [
      "Scan Everyday Rewards while paying with WISH",
      "eGift cards arrive by email for online or in-store use",
    ],
    stackNotes: [
      "Stacks with activated Everyday Rewards point boosts",
      "Buy below face value, then pay full value at the till",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    confidence: "confirmed",
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
    purchaseLocation: "Woolworths supermarkets",
    purchaseMethod: "in-store",
    limitPerCustomer: "Bonus on up to $200 per transaction (sample)",
    acceptedAt: ["App Store & iTunes", "Apple Store / apple.com"],
    usageNotes: [
      "Add the card to your Apple Account balance",
      "Not redeemable for cash",
    ],
    stackNotes: [
      "Earn Everyday Rewards on the gift card purchase",
      "Spent in the Apple ecosystem, not at our sample retailers",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
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
    purchaseLocation: "NRMA Blue member portal",
    purchaseMethod: "online",
    limitPerCustomer: "Up to $250 per order (sample)",
    acceptedAt: ["Participating restaurants & cafes (dining network)"],
    usageNotes: [
      "Useful for restaurants in the dining-network",
      "Check the venue list before buying",
    ],
    stackNotes: [
      "A discount layer for dining spend you'd make anyway",
      "Not for use at our sample retailers",
    ],
    sourceDetailUrl: "https://www.gcdb.com.au",
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
  {
    id: "pts-qantas-shopping-amazon",
    merchantId: "amazon-au",
    program: "Qantas",
    earnRateDisplay: "3 Qantas pts per $1 (Qantas Shopping)",
    earnMultiple: 3,
    pointValueCents: 1, // ~1c/pt sample valuation
    mechanism: "shopping-portal",
    expiryDate: "2026-06-30",
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "pts-velocity-estore-kogan",
    merchantId: "kogan",
    program: "Velocity",
    earnRateDisplay: "2 Velocity pts per $1 (Velocity e-Store)",
    earnMultiple: 2,
    pointValueCents: 1,
    mechanism: "shopping-portal",
    expiryDate: "2026-06-28",
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── OzBargain community signals ───────────────────────────────────────────
//
// SAMPLE / STATIC / MANUAL community-signal examples only. Nothing here was
// fetched or copied from OzBargain. Titles and summaries are our own short,
// original paraphrases; URLs are placeholder links back to OzBargain. These
// model the "signal/corroboration" layer — never a content source. Community
// posts default to "needs-verification"; the expired item is "expired-unknown".
export const ozBargainSignals: OzBargainSignal[] = [
  {
    id: "ozb-signal-jbhifi-ultimate",
    sourceNativeId: "node-845210",
    merchantId: "jb-hifi",
    title: "Discounted Ultimate gift cards reported working at JB Hi-Fi",
    summary:
      "Sample community thread: members report stacking discounted Ultimate cards on electronics. Verify acceptance in-store.",
    votesSample: 142,
    commentCount: 38,
    tags: ["gift-cards", "electronics", "ultimate"],
    promoCode: null,
    priceText: null,
    sentiment: "hot",
    dealKind: "gift-card",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-10",
    expiryDate: "2026-07-15",
    signalScore: 0.82,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-woolworths-halfprice",
    sourceNativeId: "node-845377",
    merchantId: "woolworths",
    title: "Half-price pantry staples spotted at Woolworths this week",
    summary:
      "Sample community post flagging a half-price grocery cycle. Pair with an activated Everyday Rewards boost.",
    votesSample: 98,
    commentCount: 21,
    tags: ["groceries", "half-price", "everyday-rewards"],
    promoCode: null,
    priceText: "½ price selected items",
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-11",
    expiryDate: "2026-06-17", // within 7 days → expiring soon
    signalScore: 0.75,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-coles-giftcard-points",
    sourceNativeId: "node-845401",
    merchantId: "coles",
    title: "Bonus Flybuys on Coles Group gift cards spotted in-store",
    summary:
      "Sample community report of a bonus-points promo on Coles Group gift cards. Activate in Flybuys first; confirm dates in-store.",
    votesSample: 86,
    commentCount: 17,
    tags: ["gift-cards", "flybuys", "coles"],
    promoCode: null,
    priceText: null,
    sentiment: "neutral",
    dealKind: "points",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-11",
    expiryDate: "2026-06-30",
    signalScore: 0.7,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-jbhifi-price-drop",
    sourceNativeId: "node-845588",
    merchantId: "jb-hifi",
    title: "Popular soundbar drops in price at JB Hi-Fi",
    summary:
      "Sample community price-drop alert on a soundbar. Layer a discounted gift card on top for extra savings.",
    votesSample: 64,
    commentCount: 12,
    tags: ["electronics", "audio", "price-drop"],
    promoCode: null,
    priceText: "$1,799 (was $1,999)",
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-09",
    expiryDate: "2026-06-16", // within 7 days → expiring soon
    signalScore: 0.68,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-myer-code",
    sourceNativeId: "node-845612",
    merchantId: "myer",
    title: "Community-shared Myer code for extra % off",
    summary:
      "Sample community-posted code for extra off selected ranges. Exclusions likely — verify at checkout.",
    votesSample: 53,
    commentCount: 9,
    tags: ["department-store", "coupon", "myer"],
    promoCode: "EXTRA15",
    priceText: null,
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-10",
    expiryDate: "2026-06-30",
    signalScore: 0.6,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-apple-giftcard-points",
    sourceNativeId: "node-845640",
    merchantId: null, // Apple cards aren't spent at our tracked stores
    title: "Bonus points on Apple gift cards reported at supermarkets",
    summary:
      "Sample community sighting of bonus points on Apple gift cards. Useful if you spend in the Apple ecosystem.",
    votesSample: 71,
    commentCount: 14,
    tags: ["gift-cards", "apple", "points"],
    promoCode: null,
    priceText: null,
    sentiment: "neutral",
    dealKind: "points",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-10",
    expiryDate: "2026-06-24",
    signalScore: 0.55,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-chemist-cashback",
    sourceNativeId: "node-845702",
    merchantId: "chemist-warehouse",
    title: "Upsized cashback flagged for Chemist Warehouse",
    summary:
      "Sample community note about an upsized cashback window. Track via your cashback portal before checkout.",
    votesSample: 47,
    commentCount: 6,
    tags: ["health", "cashback"],
    promoCode: null,
    priceText: null,
    sentiment: "neutral",
    dealKind: "cashback",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-09",
    expiryDate: null,
    signalScore: 0.5,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-card-statement-credit",
    sourceNativeId: "node-845755",
    merchantId: "myer",
    title: "Targeted card offer: statement credit at Myer (selected cardholders)",
    summary:
      "Sample note about a targeted statement-credit offer. Targeted only — check your own card account to confirm eligibility.",
    votesSample: 33,
    commentCount: 28,
    tags: ["credit-card", "targeted", "statement-credit"],
    promoCode: null,
    priceText: "Spend $200, get $40 back (sample)",
    sentiment: "warning",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-08",
    expiryDate: "2026-07-31",
    signalScore: 0.45,
    status: "pending",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-thegoodguys-expired",
    sourceNativeId: "node-844901",
    merchantId: "the-good-guys",
    title: "Expired: appliance bundle deal at The Good Guys",
    summary:
      "Sample expired community deal kept to show how expired signals are de-emphasised. Do not rely on it.",
    votesSample: 120,
    commentCount: 40,
    tags: ["appliances", "expired"],
    promoCode: null,
    priceText: null,
    sentiment: "expired",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/deals",
    postedAt: "2026-06-02",
    expiryDate: "2026-06-05", // past → expired styling
    signalScore: 0.1,
    status: "expired",
    confidence: "expired-unknown",
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
