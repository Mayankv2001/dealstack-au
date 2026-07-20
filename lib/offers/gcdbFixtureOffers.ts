import type { GiftCardOffer, GiftCardProduct } from "./types";
import { addDaysToIsoDate, todayAU } from "./expiry";

/**
 * TEST-ONLY GCDB acceptance fixtures — local, demo-mode representations of two
 * real Gift Card Database offers, used to exercise the complete public
 * gift-card experience (carousel paging, upcoming labels, detail pages,
 * per-denomination fee tables) in local demo mode and the browser e2e suite.
 *
 *   - GCDB 12943 — 1,000 bonus Flybuys points per eligible TCN gift card,
 *     in-store at Coles (source facts verified 2026-07-20; the real promotion
 *     ran 22–28 Jul 2026).
 *   - GCDB 12944 — 10x Everyday Rewards points on Restaurant Choice, Cafe
 *     Choice and selected Ultimate gift cards, in-store at Woolworths (same
 *     source window).
 *
 * SAFETY BOUNDARIES — read before touching:
 *   - These records are served ONLY through the demo branch of
 *     `fromDbOrDemo` (DATA_SOURCE=static or Supabase unconfigured). With a
 *     configured database they are never loaded, so they cannot duplicate or
 *     conflict with the real offers once GCDB 12943/12944 are ingested,
 *     reviewed and published through the pipeline.
 *   - `scripts/seed.ts` deliberately does NOT import this module. Nothing
 *     here may ever be seeded to a database.
 *   - The canonical path for the real offers remains ingest → review →
 *     approve (see tests/giftcards/gcdbAcceptanceLifecycle.test.ts, which
 *     proves that path end to end with the same facts).
 *
 * DATES are anchored relative to today (AU) so the fixture behaves the same
 * on every run date: both GCDB fixtures start in +2 days and end in +8 days,
 * mirroring the offsets of the real 22–28 Jul window from its 2026-07-20
 * verification date. They therefore always exercise the "upcoming" display
 * tier. Never replace these with hard-coded calendar dates — that is a CI
 * time bomb.
 */

const TODAY_AU = todayAU();

/** "YYYY-MM-DD" exactly `days` calendar days from today AU (negative = past). */
function fixtureDate(days: number): string {
  return addDaysToIsoDate(TODAY_AU, days);
}

const FIXTURE_CHECKED_AT = `${fixtureDate(0)}T09:00:00+10:00`;

/** GCDB 12943 — mirrors https://gcdb.com.au/offer/12943/ (verified 2026-07-20). */
export const gcdbFixture12943: GiftCardOffer = {
  id: "gc-gcdb-12943-coles-tcn-flybuys",
  brand: "TCN Party, TCN Teen, TCN Her, TCN Restaurant, TCN Eftpos",
  discountPercent: 0,
  channel: "supermarket-promo",
  source: "Gift Card Database",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: {
    program: "Flybuys",
    earnNote:
      "1,000 bonus Flybuys points per eligible gift card. Credit timing is not stated at the source — check your Flybuys activity after purchase.",
  },
  promotionType: "points",
  fixedPoints: 1000,
  pointsMultiplier: null,
  pointsProgram: "Flybuys",
  rewardDestination: "loyalty-points",
  capDollars: null,
  expiryDate: fixtureDate(8),
  startDate: fixtureDate(2),
  purchaseLocation: "Coles",
  purchaseMethod: "in-store",
  limitPerCustomer: "Limit of five eligible gift cards per Flybuys account",
  purchaseLimits: { totalCards: 5 },
  acceptedAt: [],
  usageNotes: [
    "In-store at Coles only.",
    "No activation required — points are awarded for the purchase itself.",
    "Points credit timing is not stated at the source; check your Flybuys activity after purchase.",
  ],
  stackNotes: [],
  sourceDetailUrl: "https://gcdb.com.au/offer/12943/",
  membershipRequired: false,
  activationRequired: false,
  couponRequired: false,
  minSpend: null,
  denominationNote: null,
  format: "physical",
  sourceName: "Gift Card Database",
  productId: null,
  includedProductIds: [
    "tcn-party",
    "tcn-teen",
    "tcn-her",
    "tcn-restaurant",
    "tcn-eftpos",
  ],
  sourceLastSeenAt: FIXTURE_CHECKED_AT,
  citations: [
    { source: "gcdb", sourceUrl: "https://gcdb.com.au/offer/12943/" },
  ],
  confidence: "confirmed",
  lastCheckedAt: FIXTURE_CHECKED_AT,
};

/** GCDB 12944 — mirrors https://gcdb.com.au/offer/12944/ (verified 2026-07-20). */
export const gcdbFixture12944: GiftCardOffer = {
  id: "gc-gcdb-12944-woolworths-everyday-rewards-10x",
  brand: "Restaurant Choice, Cafe Choice, Ultimate",
  discountPercent: 0,
  channel: "supermarket-promo",
  source: "Gift Card Database",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: {
    program: "Everyday Rewards",
    earnNote:
      "10x Everyday Rewards points on Restaurant Choice, Cafe Choice and selected Ultimate gift cards.",
  },
  promotionType: "points",
  fixedPoints: null,
  pointsMultiplier: 10,
  pointsProgram: "Everyday Rewards",
  rewardDestination: "loyalty-points",
  capDollars: null,
  expiryDate: fixtureDate(8),
  startDate: fixtureDate(2),
  purchaseLocation: "Woolworths",
  purchaseMethod: "in-store",
  limitPerCustomer:
    "Limit of five fixed-value cards and two variable-load cards per day",
  purchaseLimits: { fixedValueCardsPerDay: 5, variableLoadCardsPerDay: 2 },
  acceptedAt: [],
  usageNotes: ["In-store at Woolworths only."],
  stackNotes: [],
  sourceDetailUrl: "https://gcdb.com.au/offer/12944/",
  membershipRequired: false,
  activationRequired: false,
  couponRequired: false,
  minSpend: null,
  denominationNote: null,
  format: "physical",
  sourceName: "Gift Card Database",
  productId: null,
  includedProductIds: ["restaurant-choice", "cafe-choice", "ultimate-selected"],
  sourceLastSeenAt: FIXTURE_CHECKED_AT,
  citations: [
    { source: "gcdb", sourceUrl: "https://gcdb.com.au/offer/12944/" },
  ],
  confidence: "confirmed",
  lastCheckedAt: FIXTURE_CHECKED_AT,
};

/**
 * Supporting dataset records so demo mode exercises the full carousel paging
 * behaviour deterministically: a later-starting upcoming sample (always ranked
 * after the two GCDB fixtures within the upcoming tier) and an expired sample
 * that must never appear on any public surface.
 */
export const upcomingSampleOffer: GiftCardOffer = {
  id: "gc-fixture-upcoming-myer",
  brand: "Myer",
  discountPercent: 10,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: ["myer"],
  pointsOnPurchase: null,
  promotionType: "discount",
  rewardDestination: "checkout-discount",
  capDollars: 100,
  expiryDate: fixtureDate(11),
  startDate: fixtureDate(4),
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
  lastCheckedAt: FIXTURE_CHECKED_AT,
};

export const expiredSampleOffer: GiftCardOffer = {
  id: "gc-fixture-expired-sample",
  brand: "Expired Sample Card",
  discountPercent: 15,
  channel: "supermarket-promo",
  source: "Sample data",
  acceptedAtMerchantIds: [],
  pointsOnPurchase: null,
  promotionType: "discount",
  rewardDestination: "checkout-discount",
  capDollars: null,
  expiryDate: fixtureDate(-2),
  startDate: fixtureDate(-9),
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
  lastCheckedAt: FIXTURE_CHECKED_AT,
};

/** Demo-mode gift-card offer fixtures, GCDB records first. */
export const gcdbFixtureGiftCardOffers: GiftCardOffer[] = [
  gcdbFixture12943,
  gcdbFixture12944,
  upcomingSampleOffer,
  expiredSampleOffer,
];

// ─── Fixture products ───────────────────────────────────────────────────────

function fixtureProduct(
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
 * Demo-mode product records for the fixture offers. Denominations and the
 * eftpos purchase fees mirror the verified source facts ($100 → $5.95,
 * $200 → $7.95); `purchaseFees: {}` records a card as explicitly fee-free,
 * which is distinct from null (unknown).
 */
export const gcdbFixtureGiftCardProducts: GiftCardProduct[] = [
  fixtureProduct({
    id: "tcn-party",
    brand: "TCN Party",
    denominations: [25, 40],
    purchaseFees: {},
  }),
  fixtureProduct({
    id: "tcn-teen",
    brand: "TCN Teen",
    denominations: [50],
    purchaseFees: {},
  }),
  fixtureProduct({
    id: "tcn-her",
    brand: "TCN Her",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  fixtureProduct({
    id: "tcn-restaurant",
    brand: "TCN Restaurant",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  fixtureProduct({
    id: "tcn-eftpos",
    brand: "TCN Eftpos",
    cardNetwork: "eftpos",
    categoryRestricted: false,
    denominations: [100, 200],
    purchaseFees: { "100": 5.95, "200": 7.95 },
  }),
  fixtureProduct({
    id: "restaurant-choice",
    brand: "Restaurant Choice",
    issuer: "Ultimate",
    denominations: [50, 100],
    purchaseFees: {},
  }),
  fixtureProduct({
    id: "cafe-choice",
    brand: "Cafe Choice",
    issuer: "Ultimate",
    denominations: [25, 50, 100],
    purchaseFees: {},
  }),
  fixtureProduct({
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
