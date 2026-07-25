import type {
  CardOffer,
  CashbackOffer,
  GiftCardOffer,
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
    componentIds: ["gc-ultimate-jbhifi"],
    citations: [{ source: "gcdb", sourceUrl: "https://www.gcdb.com.au" }],
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

