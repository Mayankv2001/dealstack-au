import type {
  CardOffer,
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
  WeeklyDeal,
} from "./types";
import { addDaysToIsoDate, todayAU } from "./expiry";

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
 * DATES ARE ANCHORED TO TODAY, not written as literals. Public reads pass
 * this data through the expiry guard (lib/offers/expiry.ts filterLive), so
 * fixed dates silently lapse as real time passes and the demo states the
 * e2e suite asserts on disappear — that broke CI when the original
 * late-June-2026 literals expired in mid-July. Every date is an offset from
 * today's AU date chosen to preserve the intended state: live, expiring soon
 * (within EXPIRY_SOON_DAYS), or deliberately expired.
 *
 * Merchant ids below must match Store.id in lib/data.ts:
 *   myer · jb-hifi · the-good-guys · coles · woolworths · amazon-au ·
 *   kogan · chemist-warehouse
 */

/** Today's AU calendar date, captured once at module load. */
const TODAY_AU = todayAU();

/** "YYYY-MM-DD" exactly `days` calendar days from today AU (negative = past). */
function sampleDate(days: number): string {
  return addDaysToIsoDate(TODAY_AU, days);
}

/** Monday (YYYY-MM-DD) of the current AU week — the weekOf convention. */
function sampleWeekMonday(): string {
  const [y, m, d] = TODAY_AU.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

/** ISO timestamp `daysAgo` days back, 22:00 AEST — sample lastCheckedAt. */
function sampleCheckedAt(daysAgo: number): string {
  return `${sampleDate(-daysAgo)}T22:00:00+10:00`;
}

const SAMPLE_CHECKED_AT = sampleCheckedAt(1);
/** Deliberately old, to demonstrate the stale-data warning. */
const STALE_CHECKED_AT = sampleCheckedAt(36);

// ─── Gift card offers ──────────────────────────────────────────────────────
export const giftCardOffers: GiftCardOffer[] = [
  {
    // Structured fixed-points sample. This record once carried its value only
    // as prose (discountPercent 0 + an earnNote sentence) — the shape the
    // public value-readiness boundary now rejects; it doubles as the reference
    // fixture for a well-formed fixed-points promotion.
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
    promotionType: "points",
    fixedPoints: 2000,
    pointsProgram: "Flybuys",
    thresholdDollars: 100,
    rewardDestination: "loyalty-points",
    capDollars: 200,
    expiryDate: sampleDate(97),
    startDate: sampleDate(-17),
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
    expiryDate: sampleDate(20),
    startDate: sampleDate(-24),
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
    expiryDate: sampleDate(5), // close to today → triggers expiry-soon
    startDate: sampleDate(-24),
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
    expiryDate: sampleDate(15),
    startDate: sampleDate(-24),
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
      earnNote: "Sample: 10x Everyday Rewards points on Apple gift cards this week",
    },
    // Structured multiplier sample — the value-readiness boundary rejects
    // prose-only points promotions, so the mechanic is recorded properly.
    promotionType: "points",
    pointsMultiplier: 10,
    pointsProgram: "Everyday Rewards",
    rewardDestination: "loyalty-points",
    capDollars: 200,
    expiryDate: sampleDate(29),
    startDate: sampleDate(-17),
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
    expiryDate: sampleDate(36),
    startDate: sampleDate(-24),
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
    expiryDate: sampleDate(97),
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
    expiryDate: sampleDate(22),
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
    expiryDate: sampleDate(97),
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
    expiryDate: sampleDate(33),
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── Card offers (bank / credit-card sign-up bonuses) ──────────────────────
// Demo rows only, hand-typed for the admin CRUD launch — NOT scraped, NOT
// live-verified. Every figure is illustrative/rounded, not a confirmed rate.
// confidence is deliberately "needs-verification" and the seed script (see
// scripts/seed.ts) inserts these as UNPUBLISHED drafts: an admin must open
// each one, check it against the bank's own current page, and publish by
// hand before it can appear anywhere public. See docs/bank-card-offer-workflow.md.
export const cardOffers: CardOffer[] = [
  {
    id: "card-amex-qantas-bonus",
    provider: "American Express",
    cardName: "Qantas Ultimate Card",
    offerType: "sign_up_bonus",
    bonusPoints: 100000,
    cashbackAmount: null,
    statementCreditAmount: null,
    minimumSpend: 3000,
    minimumSpendPeriod: "3 months",
    annualFee: 450,
    bonusStages: [{ points: 100000, requirement: "Spend $3,000 in 3 months", timing: "Initial bonus", withinFirstYear: true }],
    pointValueCents: 1,
    eligibilityNotes:
      "Sample only. Typically new customers, subject to not holding/having held a similar Amex Qantas card recently — check current terms.",
    offerSummary:
      "Illustrative sign-up bonus: bonus Qantas Points after meeting a minimum-spend threshold within a set window.",
    sourceUrl: "https://www.americanexpress.com/en-au/",
    confidence: "needs-verification",
    expiryDate: null,
    reviewByDate: sampleDate(67),
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "card-nab-rewards-bonus",
    provider: "NAB",
    cardName: "NAB Rewards Signature Card",
    offerType: "sign_up_bonus",
    bonusPoints: 90000,
    cashbackAmount: null,
    statementCreditAmount: null,
    minimumSpend: 4000,
    minimumSpendPeriod: "3 months",
    annualFee: 195,
    bonusStages: [{ points: 90000, requirement: "Spend $4,000 in 3 months", timing: "Initial bonus", withinFirstYear: true }],
    pointValueCents: 0.5,
    eligibilityNotes:
      "Sample only. Typically new-to-product customers — check current terms before applying.",
    offerSummary:
      "Illustrative sign-up bonus: bonus NAB Rewards points after meeting a minimum-spend threshold within a set window.",
    sourceUrl: "https://www.nab.com.au/personal/credit-cards",
    confidence: "needs-verification",
    expiryDate: null,
    reviewByDate: sampleDate(67),
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "card-cba-statement-credit",
    provider: "Commonwealth Bank",
    cardName: "CommBank Low Fee Gold Credit Card",
    offerType: "statement_credit",
    bonusPoints: null,
    cashbackAmount: null,
    statementCreditAmount: 200,
    minimumSpend: 1500,
    minimumSpendPeriod: "60 days",
    annualFee: 59,
    bonusStages: [],
    pointValueCents: null,
    eligibilityNotes:
      "Sample only. Typically new cardholders — check current terms before applying.",
    offerSummary:
      "Illustrative statement credit after meeting a minimum-spend threshold within a set window.",
    sourceUrl: "https://www.commbank.com.au/credit-cards.html",
    confidence: "needs-verification",
    expiryDate: null,
    reviewByDate: sampleDate(67),
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "card-westpac-altitude-bonus",
    provider: "Westpac",
    cardName: "Altitude Platinum",
    offerType: "points_bonus",
    bonusPoints: 120000,
    cashbackAmount: null,
    statementCreditAmount: null,
    minimumSpend: 3000,
    minimumSpendPeriod: "90 days",
    annualFee: 250,
    bonusStages: [{ points: 120000, requirement: "Spend $3,000 in 90 days", timing: "Initial bonus", withinFirstYear: true }],
    pointValueCents: 0.4,
    eligibilityNotes:
      "Sample only. Typically new-to-bank or new-to-product customers — check current terms before applying.",
    offerSummary:
      "Illustrative bonus Altitude Rewards points after meeting a minimum-spend threshold within a set window.",
    sourceUrl: "https://www.westpac.com.au/personal-banking/credit-cards/",
    confidence: "needs-verification",
    expiryDate: null,
    reviewByDate: sampleDate(67),
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "card-anz-rewards-bonus",
    provider: "ANZ",
    cardName: "ANZ Rewards Black",
    offerType: "sign_up_bonus",
    bonusPoints: 100000,
    cashbackAmount: null,
    statementCreditAmount: null,
    minimumSpend: 3000,
    minimumSpendPeriod: "3 months",
    annualFee: 375,
    bonusStages: [{ points: 100000, requirement: "Spend $3,000 in 3 months", timing: "Initial bonus", withinFirstYear: true }],
    pointValueCents: 0.5,
    eligibilityNotes:
      "Sample only. Typically new-to-product customers — check current terms before applying.",
    offerSummary:
      "Illustrative sign-up bonus: bonus ANZ Rewards points after meeting a minimum-spend threshold within a set window.",
    sourceUrl: "https://www.anz.com.au/personal/credit-cards/",
    confidence: "needs-verification",
    expiryDate: null,
    reviewByDate: sampleDate(67),
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// ─── OzBargain community signals ───────────────────────────────────────────
//
// SAMPLE / STATIC / MANUAL community-signal examples only. Nothing here was
// fetched or copied from OzBargain. Titles and summaries are our own short,
// original paraphrases. `sourceUrl` uses exact-style placeholder node URLs
// (https://www.ozbargain.com.au/node/9000xx) so each card links to a specific
// post rather than a generic page; `productUrl`/`merchantUrl` are placeholder
// retailer destinations. These model the "signal/corroboration" layer — never
// a content source. Community posts default to "needs-verification"; the
// expired item is "expired-unknown".
//
// Every entry below is a SAMPLE: its `sourceUrl` is a placeholder node URL, not
// a real post. We stamp `isSample: true` on all of them via the map at the end
// so the UI never renders these as live OzBargain links.
const SAMPLE_SIGNALS: Omit<OzBargainSignal, "isSample">[] = [
  {
    id: "ozb-signal-jbhifi-macbook",
    sourceNativeId: "node-900020",
    merchantId: "jb-hifi",
    title: "MacBook Air M3 spotted at a sharp price at JB Hi-Fi",
    summary:
      "Sample price-drop signal. Pair with discounted Ultimate gift cards and a cashback portal — the Smart Stack estimates the effective price below.",
    votesSample: 168,
    commentCount: 44,
    tags: ["hot-buys", "electronics", "laptop", "macbook", "apple"],
    promoCode: null,
    priceText: "$1,799 (was $2,199)",
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900020",
    merchantUrl: "https://www.jbhifi.com.au",
    productUrl: "https://www.jbhifi.com.au/products/apple-macbook-air-m3",
    productGroup: "macbook-air-m3",
    postedAt: sampleDate(-1),
    expiryDate: sampleDate(67),
    signalScore: 0.88,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  // ── Costco "Hot Buys" samples ──────────────────────────────────────────
  // SAMPLE manual-curation rows (isSample stamped below), tagged "costco" +
  // "hot-buys" so the public Costco section can filter them. These are NOT
  // scraped from costco.com.au and NOT auto-published — same posture as every
  // other sample signal: approved, illustrative, placeholder URLs.
  {
    id: "ozb-signal-costco-macbook-hotbuy",
    sourceNativeId: "node-900024",
    merchantId: "costco",
    title: "Costco Hot Buys: MacBook Air M3 bundle for members",
    summary:
      "Sample Hot Buys listing. Costco member pricing on a current MacBook Air bundle — verify in warehouse or on the member site.",
    votesSample: 96,
    commentCount: 19,
    tags: ["costco", "hot-buys", "electronics", "laptop", "macbook"],
    promoCode: null,
    priceText: "$1,749 member price",
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900024",
    merchantUrl: "https://www.costco.com.au",
    productUrl: "https://www.costco.com.au/c/hot-buys",
    productGroup: "macbook-air-m3",
    postedAt: sampleDate(0),
    expiryDate: sampleDate(36),
    signalScore: 0.8,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-costco-tv-hotbuy",
    sourceNativeId: "node-900022",
    merchantId: "costco",
    title: "Costco Hot Buys: 65\" 4K TV with member discount",
    summary:
      "Sample Hot Buys listing. A large 4K TV at member pricing this cycle — stock and price vary by warehouse, confirm before travelling.",
    votesSample: 74,
    commentCount: 12,
    tags: ["costco", "hot-buys", "electronics", "tv"],
    promoCode: null,
    priceText: "$795 member price",
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900022",
    merchantUrl: "https://www.costco.com.au",
    productUrl: "https://www.costco.com.au/c/hot-buys",
    postedAt: sampleDate(-1),
    expiryDate: sampleDate(33),
    signalScore: 0.73,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-costco-airpods-hotbuy",
    sourceNativeId: "node-900023",
    merchantId: "costco",
    title: "Costco Hot Buys: wireless earbuds instant savings",
    summary:
      "Sample Hot Buys listing. Instant member savings on popular wireless earbuds — limited-time card on the warehouse floor.",
    votesSample: 58,
    commentCount: 8,
    tags: ["costco", "hot-buys", "electronics", "audio"],
    promoCode: null,
    priceText: "$249 ($60 instant saving)",
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900023",
    merchantUrl: "https://www.costco.com.au",
    productUrl: "https://www.costco.com.au/c/hot-buys",
    postedAt: sampleDate(-2),
    expiryDate: sampleDate(31),
    signalScore: 0.68,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-jbhifi-ultimate",
    sourceNativeId: "node-900001",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900001",
    merchantUrl: "https://www.jbhifi.com.au",
    productUrl: "https://www.jbhifi.com.au/collections/gift-cards",
    postedAt: sampleDate(-15),
    expiryDate: sampleDate(20),
    signalScore: 0.82,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-amazon-deal",
    sourceNativeId: "node-900002",
    merchantId: "amazon-au",
    title: "Popular noise-cancelling headphones at a low at Amazon AU",
    summary:
      "Sample community price-drop alert. Click through a cashback portal first, then check the live price.",
    votesSample: 140,
    commentCount: 52,
    tags: ["hot-buys", "electronics", "audio", "amazon"],
    promoCode: null,
    priceText: "$129 (was $179)",
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900002",
    merchantUrl: "https://www.amazon.com.au",
    productUrl: "https://www.amazon.com.au/deals",
    postedAt: sampleDate(-14),
    expiryDate: sampleDate(4), // within 7 days → expiring soon
    signalScore: 0.78,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-woolworths-halfprice",
    sourceNativeId: "node-900003",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900003",
    merchantUrl: "https://www.woolworths.com.au",
    productUrl: "https://www.woolworths.com.au/shop/catalogue",
    postedAt: sampleDate(-14),
    expiryDate: sampleDate(3), // within 7 days → expiring soon
    signalScore: 0.75,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-jbhifi-code",
    sourceNativeId: "node-900004",
    merchantId: "jb-hifi",
    title: "App-only code shared for selected JB Hi-Fi categories",
    summary:
      "Sample community-posted app code for a little extra off. Exclusions likely — confirm in the JB Hi-Fi app.",
    votesSample: 110,
    commentCount: 30,
    tags: ["electronics", "coupon", "app-only"],
    promoCode: "APP5",
    priceText: null,
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900004",
    merchantUrl: "https://www.jbhifi.com.au",
    productUrl: null,
    postedAt: sampleDate(-15),
    expiryDate: sampleDate(25),
    signalScore: 0.72,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-coles-giftcard-points",
    sourceNativeId: "node-900005",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900006",
    merchantUrl: "https://www.coles.com.au",
    productUrl: "https://www.coles.com.au/gift-cards",
    postedAt: sampleDate(-14),
    expiryDate: sampleDate(66),
    signalScore: 0.7,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-apple-giftcard-points",
    sourceNativeId: "node-900007",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900008",
    merchantUrl: "https://www.apple.com/au/",
    productUrl: null,
    postedAt: sampleDate(-15),
    expiryDate: sampleDate(29),
    signalScore: 0.62,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-myer-code",
    sourceNativeId: "node-900009",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900010",
    merchantUrl: "https://www.myer.com.au",
    productUrl: null,
    postedAt: sampleDate(-15),
    expiryDate: sampleDate(66),
    signalScore: 0.6,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-kogan-deal",
    sourceNativeId: "node-900011",
    merchantId: "kogan",
    title: "Kogan app code shared for selected categories",
    summary:
      "Sample community code for a small extra discount on selected Kogan lines. Check category exclusions first.",
    votesSample: 38,
    commentCount: 7,
    tags: ["hot-buys", "marketplace", "coupon", "kogan"],
    promoCode: "KOGAN10",
    priceText: null,
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://www.ozbargain.com.au/node/900012",
    merchantUrl: "https://www.kogan.com",
    productUrl: null,
    postedAt: sampleDate(-16),
    expiryDate: sampleDate(26),
    signalScore: 0.55,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-chemist-cashback",
    sourceNativeId: "node-900013",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900014",
    merchantUrl: "https://www.chemistwarehouse.com.au",
    productUrl: null,
    postedAt: sampleDate(-16),
    expiryDate: null,
    signalScore: 0.52,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-qantas-shopping",
    sourceNativeId: "node-900015",
    merchantId: "amazon-au",
    title: "Bonus Qantas points via shopping portal on selected stores",
    summary:
      "Sample community note about a points-portal bonus. Click through the portal before you buy; value the points realistically.",
    votesSample: 60,
    commentCount: 11,
    tags: ["points", "qantas", "shopping-portal"],
    promoCode: null,
    priceText: null,
    sentiment: "neutral",
    dealKind: "points",
    sourceUrl: "https://www.ozbargain.com.au/node/900016",
    merchantUrl: "https://www.amazon.com.au",
    productUrl: null,
    postedAt: sampleDate(-17),
    expiryDate: sampleDate(66),
    signalScore: 0.5,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-card-statement-credit",
    sourceNativeId: "node-900017",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900018",
    merchantUrl: null,
    productUrl: null,
    postedAt: sampleDate(-17),
    expiryDate: sampleDate(36),
    signalScore: 0.45,
    status: "pending",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-restaurant-giftcard",
    sourceNativeId: "node-900019",
    merchantId: null,
    title: "Discounted dining gift cards reported via a member portal",
    summary:
      "Sample community sighting of discounted restaurant/cafe gift cards. A discount layer for dining you'd do anyway.",
    votesSample: 25,
    commentCount: 4,
    tags: ["gift-cards", "dining"],
    promoCode: null,
    priceText: null,
    sentiment: "neutral",
    dealKind: "gift-card",
    sourceUrl: "https://www.ozbargain.com.au/node/900020",
    merchantUrl: null,
    productUrl: null,
    postedAt: sampleDate(-18),
    expiryDate: sampleDate(36),
    signalScore: 0.4,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
  {
    id: "ozb-signal-thegoodguys-expired",
    sourceNativeId: "node-900021",
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
    sourceUrl: "https://www.ozbargain.com.au/node/900022",
    merchantUrl: "https://www.thegoodguys.com.au",
    productUrl: null,
    postedAt: sampleDate(-23),
    expiryDate: sampleDate(-20), // past → expired styling
    signalScore: 0.1,
    status: "expired",
    confidence: "expired-unknown",
    lastCheckedAt: SAMPLE_CHECKED_AT,
  },
];

// Real, admin-curated Costco Hot Buys (transcribed by hand from data supplied by
// the operator — NOT scraped). isSample: false, so they render with a live link
// to Costco's Hot Buys page. Prices change; confidence stays needs-verification.
const COSTCO_HOT_BUYS_REAL: OzBargainSignal[] = [
  {
    id: "costco-hotbuy-airpods4",
    sourceNativeId: "costco:airpods4",
    merchantId: "costco",
    title: "Apple AirPods 4",
    summary:
      "Costco Hot Buy: Apple AirPods 4 at member price, delivery included. Trade in an old device for $20+ as a Costco Shop Card. Rated 4.8★.",
    votesSample: null,
    commentCount: null,
    tags: ["costco", "hot-buys", "electronics", "audio", "airpods", "apple"],
    promoCode: null,
    priceText: "$144.99 (save $65)",
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.costco.com.au/c/hot-buys",
    merchantUrl: "https://www.costco.com.au",
    productUrl: "https://www.costco.com.au/c/hot-buys",
    postedAt: "2026-06-28",
    expiryDate: null,
    signalScore: 0.86,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
    isSample: false,
  },
  {
    id: "costco-hotbuy-airpods4-anc",
    sourceNativeId: "costco:airpods4-anc",
    merchantId: "costco",
    title: "Apple AirPods 4 with Active Noise Cancellation",
    summary:
      "Costco Hot Buy: Apple AirPods 4 with Active Noise Cancellation at member price, delivery included. Trade-in offer available. Rated 4.7★.",
    votesSample: null,
    commentCount: null,
    tags: ["costco", "hot-buys", "electronics", "audio", "airpods", "apple", "anc"],
    promoCode: null,
    priceText: "$264.99 (save $15)",
    sentiment: "hot",
    dealKind: "discount-code",
    sourceUrl: "https://www.costco.com.au/c/hot-buys",
    merchantUrl: "https://www.costco.com.au",
    productUrl: "https://www.costco.com.au/c/hot-buys",
    postedAt: "2026-06-28",
    expiryDate: null,
    signalScore: 0.84,
    status: "approved",
    confidence: "needs-verification",
    lastCheckedAt: SAMPLE_CHECKED_AT,
    isSample: false,
  },
];

// Static sample signals are stamped isSample: true (muted "Sample listing"
// label, placeholder URLs never linked). Real curated Hot Buys are appended as-is.
export const ozBargainSignals: OzBargainSignal[] = [
  ...SAMPLE_SIGNALS.map((s) => ({
    ...s,
    isSample: true,
  })),
  ...COSTCO_HOT_BUYS_REAL,
];

// ─── Weekly deals (curated view referencing the offers above) ──────────────
export const weeklyDeals: WeeklyDeal[] = [
  {
    id: "wk-2026-06-08-jbhifi-stack",
    weekOf: sampleWeekMonday(),
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
    expiryDate: sampleDate(20),
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-woolworths-20x",
    weekOf: sampleWeekMonday(),
    merchantId: "woolworths",
    title: "Points boost: 20x Everyday Rewards at Woolworths",
    summary:
      "Sample activated offer — activate in-app before shopping to earn 20x on eligible spend.",
    highlight: "points",
    componentIds: ["pts-woolworths-20x"],
    citations: [
      { source: "freepoints", sourceUrl: "https://www.freepoints.com.au" },
    ],
    expiryDate: sampleDate(22),
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-coles-gc-points",
    weekOf: sampleWeekMonday(),
    merchantId: "coles",
    title: "Gift card bonus: Flybuys when buying Coles Group cards",
    summary:
      "Sample: bonus Flybuys for buying Coles Group gift cards, then spend them on your normal shop.",
    highlight: "gift-card",
    componentIds: ["gc-coles-group-bonus-points", "pts-coles-flybuys-base"],
    citations: [
      { source: "gcdb", sourceUrl: "https://www.gcdb.com.au" },
    ],
    expiryDate: sampleDate(97),
    confidence: "needs-verification",
  },
  {
    id: "wk-2026-06-08-myer-cashback",
    weekOf: sampleWeekMonday(),
    merchantId: "myer",
    title: "Cashback boost: upsized ShopBack at Myer",
    summary:
      "Sample upsized ShopBack rate — note it excludes gift card payment, so choose one or the other.",
    highlight: "cashback",
    componentIds: ["cb-shopback-myer"],
    citations: [
      { source: "manual", sourceUrl: "https://www.shopback.com.au" },
    ],
    expiryDate: sampleDate(97),
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
