import type { GiftCardOffer, GiftCardProduct } from "./types";
import { addDaysToIsoDate, todayAU } from "./expiry";

/**
 * Demo/static-mode SAMPLE gift-card offers and products.
 *
 * These records exist ONLY to give local demo mode (DATA_SOURCE=static or an
 * unconfigured Supabase) and the browser e2e suite a realistic dataset to
 * render — the carousel's active/upcoming tiers, per-denomination fee tables,
 * distinct per-day purchase limits and the "not cash" points framing. They are
 * SAMPLE DATA, not offers:
 *
 *   - They carry `gc-sample-*` ids and a "Sample data" source, so they never
 *     share identity with a real published offer. The real GCDB promotions
 *     (e.g. gcdb.com.au offers 12943/12944) exist ONLY as database rows created
 *     through the canonical ingest → review → approve pipeline
 *     (scripts/gift-card-ingest.ts, then the approve RPC; proven end to end by
 *     tests/giftcards/gcdbAcceptanceLifecycle.test.ts). With a configured
 *     database `fromDbOrDemo` never touches this module.
 *   - `scripts/seed.ts` deliberately does NOT import this module. Nothing here
 *     may ever be seeded to a database.
 *
 * The product records keep their real catalogue ids (tcn-party, tcn-eftpos, …)
 * because products are stable reference facts (a card's denominations and
 * purchase fees), not promotions — sharing those ids with the seeded catalogue
 * is consistent, not a duplicate offer.
 *
 * DATES are anchored relative to today (AU) so the sample behaves the same on
 * every run date: the two points samples start in +2 days and end in +8 days
 * (always the "upcoming" tier); the generic upcoming sample starts +4/ends +11;
 * the expired sample ended in the past and must never render. Never replace
 * these with hard-coded calendar dates — that is a CI time bomb.
 */

const TODAY_AU = todayAU();

/** "YYYY-MM-DD" exactly `days` calendar days from today AU (negative = past). */
function sampleDate(days: number): string {
  return addDaysToIsoDate(TODAY_AU, days);
}

const SAMPLE_CHECKED_AT = `${sampleDate(0)}T09:00:00+10:00`;

/**
 * Sample fixed-points offer — mirrors the SHAPE of a Coles/TCN Flybuys
 * promotion (a fixed award across several cards, one carrying per-denomination
 * fees) so the detail page's product/denomination/fee surfaces have demo
 * coverage. Sample identity, real-world product/programme names.
 */
export const sampleColesTcnFlybuysOffer: GiftCardOffer = {
  id: "gc-sample-coles-tcn-flybuys",
  brand: "TCN Party, TCN Teen, TCN Her, TCN Restaurant, TCN Eftpos",
  discountPercent: 0,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: {
    program: "Flybuys",
    earnNote: "1,000 Flybuys points per eligible card (sample data).",
  },
  promotionType: "points",
  fixedPoints: 1000,
  pointsMultiplier: null,
  pointsProgram: "Flybuys",
  rewardDestination: "loyalty-points",
  capDollars: null,
  expiryDate: sampleDate(8),
  startDate: sampleDate(2),
  purchaseLocation: "Coles",
  purchaseMethod: "in-store",
  limitPerCustomer: "Limit of five eligible gift cards in total per Flybuys account",
  purchaseLimits: { totalCards: 5 },
  acceptedAt: [],
  usageNotes: [
    "In-store at Coles only.",
    "No activation required — points are awarded for the purchase itself.",
    "Avoid the $100/$200 TCN Eftpos cards: their purchase fees exceed the bonus value.",
  ],
  stackNotes: [],
  sourceDetailUrl: undefined,
  membershipRequired: false,
  activationRequired: false,
  couponRequired: false,
  minSpend: null,
  denominationNote: "Selected denominations only — see the eligible cards below.",
  format: "physical",
  sourceName: "Sample data",
  productId: null,
  includedProductIds: [
    "tcn-party",
    "tcn-teen",
    "tcn-her",
    "tcn-restaurant",
    "tcn-eftpos",
  ],
  sourceLastSeenAt: SAMPLE_CHECKED_AT,
  citations: [],
  confidence: "confirmed",
  lastCheckedAt: SAMPLE_CHECKED_AT,
};

/**
 * Sample points-multiplier offer with DISTINCT fixed-value and variable-load
 * per-day limits (they must never be merged) — mirrors a Woolworths/Everyday
 * Rewards promotion shape. Sample identity, real-world product/programme names.
 */
export const sampleWoolworthsEdrOffer: GiftCardOffer = {
  id: "gc-sample-woolworths-edr-10x",
  brand: "Restaurant Choice, Cafe Choice, Ultimate",
  discountPercent: 0,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: {
    program: "Everyday Rewards",
    earnNote:
      "10x Everyday Rewards points on Restaurant Choice, Cafe Choice and selected Ultimate cards (sample data).",
  },
  promotionType: "points",
  fixedPoints: null,
  pointsMultiplier: 10,
  pointsProgram: "Everyday Rewards",
  rewardDestination: "loyalty-points",
  capDollars: null,
  expiryDate: sampleDate(8),
  startDate: sampleDate(2),
  purchaseLocation: "Woolworths",
  purchaseMethod: "in-store",
  limitPerCustomer:
    "Limit of five fixed-value cards and two variable-load cards per day",
  purchaseLimits: { fixedValueCardsPerDay: 5, variableLoadCardsPerDay: 2 },
  acceptedAt: [],
  usageNotes: ["In-store at Woolworths only."],
  stackNotes: [],
  sourceDetailUrl: undefined,
  membershipRequired: false,
  activationRequired: false,
  couponRequired: false,
  minSpend: null,
  denominationNote: null,
  format: "physical",
  sourceName: "Sample data",
  productId: null,
  includedProductIds: ["restaurant-choice", "cafe-choice", "ultimate-selected"],
  sourceLastSeenAt: SAMPLE_CHECKED_AT,
  citations: [],
  confidence: "confirmed",
  lastCheckedAt: SAMPLE_CHECKED_AT,
};

/**
 * Supporting records so demo mode exercises full carousel paging
 * deterministically: a later-starting upcoming sample (always ranked after the
 * two points samples within the upcoming tier) and an expired sample that must
 * never appear on any public surface.
 */
export const sampleUpcomingOffer: GiftCardOffer = {
  id: "gc-sample-upcoming-myer",
  brand: "Myer",
  discountPercent: 10,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: ["myer"],
  pointsOnPurchase: null,
  promotionType: "discount",
  rewardDestination: "checkout-discount",
  capDollars: 100,
  expiryDate: sampleDate(11),
  startDate: sampleDate(4),
  purchaseLocation: "Sample seller",
  purchaseMethod: "in-store",
  limitPerCustomer: null,
  acceptedAt: ["Myer"],
  usageNotes: ["Sample upcoming offer for the demo dataset."],
  stackNotes: [],
  sourceDetailUrl: undefined,
  format: "physical",
  sourceName: "Sample data",
  productId: null,
  citations: [],
  confidence: "needs-verification",
  lastCheckedAt: SAMPLE_CHECKED_AT,
};

export const sampleExpiredOffer: GiftCardOffer = {
  id: "gc-sample-expired",
  brand: "Expired Sample Card",
  discountPercent: 15,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: null,
  promotionType: "discount",
  rewardDestination: "checkout-discount",
  capDollars: null,
  expiryDate: sampleDate(-2),
  startDate: sampleDate(-9),
  purchaseLocation: "Sample seller",
  purchaseMethod: "in-store",
  limitPerCustomer: null,
  acceptedAt: [],
  usageNotes: ["Sample expired offer — must never render publicly."],
  stackNotes: [],
  sourceDetailUrl: undefined,
  format: "physical",
  sourceName: "Sample data",
  productId: null,
  citations: [],
  confidence: "needs-verification",
  lastCheckedAt: SAMPLE_CHECKED_AT,
};

/** Demo-mode gift-card offer samples, points samples first. */
export const sampleGiftCardOffers: GiftCardOffer[] = [
  sampleColesTcnFlybuysOffer,
  sampleWoolworthsEdrOffer,
  sampleUpcomingOffer,
  sampleExpiredOffer,
];

// ─── Sample products ────────────────────────────────────────────────────────

function sampleProduct(
  overrides: Partial<GiftCardProduct> & { id: string; brand: string },
): GiftCardProduct {
  return {
    slug: overrides.id,
    issuer: "TCN",
    cardNetwork: "closed-loop",
    format: "physical",
    variableLoad: false,
    minDenomination: null,
    maxDenomination: null,
    categoryRestricted: true,
    supportedMccs: [],
    unsupportedMccs: [],
    mobileWallet: "unknown",
    redemptionNotes: null,
    aliases: [],
    officialProductPage: null,
    activationMethod: null,
    onlineAvailable: null,
    inStoreAvailable: true,
    denominations: null,
    activationDelayNote: null,
    splitPayment: "unknown",
    expiryOrFeesNote: null,
    purchaseFees: null,
    ...overrides,
  };
}

/**
 * Demo-mode product records for the sample offers. Denominations and the eftpos
 * purchase fees mirror the real catalogue facts ($100 → $5.95, $200 → $7.95);
 * `purchaseFees: {}` records a card as explicitly fee-free, distinct from null
 * (unknown). Ids match the real catalogue because a product is stable reference
 * data, not a promotion.
 */
export const sampleGiftCardProducts: GiftCardProduct[] = [
  sampleProduct({
    id: "tcn-party",
    brand: "TCN Party",
    denominations: [25, 40],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "tcn-teen",
    brand: "TCN Teen",
    denominations: [50],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "tcn-her",
    brand: "TCN Her",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "tcn-restaurant",
    brand: "TCN Restaurant",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "tcn-eftpos",
    brand: "TCN Eftpos",
    cardNetwork: "eftpos",
    categoryRestricted: false,
    denominations: [100, 200],
    purchaseFees: { "100": 5.95, "200": 7.95 },
  }),
  sampleProduct({
    id: "restaurant-choice",
    brand: "Restaurant Choice",
    issuer: "Ultimate",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "cafe-choice",
    brand: "Cafe Choice",
    issuer: "Ultimate",
    denominations: [25, 50, 100],
    purchaseFees: {},
  }),
  sampleProduct({
    id: "ultimate-selected",
    brand: "Ultimate (selected)",
    issuer: "Ultimate",
    variableLoad: true,
    minDenomination: 20,
    maxDenomination: 500,
    denominations: null,
    purchaseFees: {},
  }),
];
