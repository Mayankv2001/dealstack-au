import type { Store } from "@/lib/data";
import type {
  CashbackOffer,
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
  OzBargainSignal,
  PointsOffer,
} from "@/lib/offers/types";
import type { StackData } from "@/lib/stack/buildStack";

/**
 * Minimal, valid test fixtures for the stack engine (offline; no DB, no network).
 *
 * Each factory returns a fully-typed object with safe defaults and accepts an
 * override patch, so individual tests state only the fields they care about. All
 * imports are type-only, so this module pulls in no runtime `@/` code.
 */

/**
 * Deterministic "now" for the stack engine tests.
 *
 * The stack engine flags offers as stale/expiring relative to a clock. Passing
 * this fixed Date (rather than letting the engine call `new Date()`) keeps the
 * fixtures' `lastCheckedAt` / `expiryDate` at a constant offset from "now", so
 * warning assertions never drift as real wall-clock time passes. It sits a few
 * days after the default fixture `lastCheckedAt` (2026-06-12) and well within
 * STALE_DATA_DAYS, so unmodified fixtures produce no stale-data warning.
 */
export const TEST_NOW = new Date("2026-06-15T00:00:00+10:00");

export function makeStore(over: Partial<Store> = {}): Store {
  return {
    id: "myer",
    name: "Myer",
    category: "Department Store",
    logo: "MYER",
    discountPercent: 0,
    discountCode: "NONE",
    expiryDate: null,
    cashbackPercent: 0,
    cashbackProvider: "ShopBack",
    giftCardDiscountPercent: 0,
    giftCardSource: "n/a",
    pointsProgram: "n/a",
    pointsRate: "n/a",
    ...over,
  };
}

export function makeCashback(over: Partial<CashbackOffer> = {}): CashbackOffer {
  return {
    id: "cb-1",
    merchantId: "myer",
    provider: "ShopBack",
    ratePercent: 5,
    flatAmount: null,
    capDollars: null,
    isUpsized: false,
    excludesGiftCardPayment: false,
    termsSummary: "Sample terms.",
    expiryDate: null,
    citations: [{ source: "manual", sourceUrl: "/" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

export function makeGiftCard(over: Partial<GiftCardOffer> = {}): GiftCardOffer {
  return {
    id: "gc-1",
    brand: "Coles Group",
    discountPercent: 5,
    channel: "membership-portal",
    source: "RACV",
    acceptedAtMerchantIds: ["myer"],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: null,
    startDate: null,
    citations: [{ source: "manual", sourceUrl: "/" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

export function makeGiftCardProduct(
  over: Partial<GiftCardProduct> = {}
): GiftCardProduct {
  return {
    id: "product-1",
    brand: "Coles Group",
    slug: "coles-group",
    issuer: "Coles Group",
    cardNetwork: "closed-loop",
    format: "digital-and-physical",
    variableLoad: true,
    minDenomination: 10,
    maxDenomination: 500,
    categoryRestricted: false,
    supportedMccs: [],
    unsupportedMccs: [],
    mobileWallet: "unknown",
    redemptionNotes: null,
    aliases: [],
    officialProductPage: null,
    activationMethod: null,
    onlineAvailable: null,
    inStoreAvailable: null,
    denominations: null,
    activationDelayNote: null,
    splitPayment: "unknown",
    expiryOrFeesNote: null,
    purchaseFees: null,
    ...over,
  };
}

export function makeGiftCardAcceptance(
  over: Partial<GiftCardAcceptanceRow> = {}
): GiftCardAcceptanceRow {
  return {
    id: "acceptance-1",
    productId: "product-1",
    storeId: "myer",
    merchantName: "Myer",
    merchantCategory: "Department Store",
    mcc: null,
    status: "verified",
    outcome: "successful",
    sourceUrl: "https://example.com/acceptance",
    checkedAt: "2026-06-12T00:00:00+10:00",
    notes: null,
    acceptanceStatus: "confirmed-accepted",
    evidenceSourceType: "issuer-official",
    evidencePublisher: "Test issuer",
    evidenceUrl: "https://example.com/acceptance",
    evidenceCapturedAt: "2026-06-12T00:00:00+10:00",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    acceptsOnline: true,
    acceptsInStore: true,
    acceptsApp: null,
    acceptsPhone: null,
    validFrom: null,
    validUntil: null,
    limitations: null,
    region: "AU",
    participatingLocationRequired: null,
    ...over,
  };
}

export function makePoints(over: Partial<PointsOffer> = {}): PointsOffer {
  return {
    id: "pt-1",
    merchantId: "myer",
    program: "Flybuys",
    earnRateDisplay: "2x / $1",
    earnMultiple: 2,
    pointValueCents: 1,
    mechanism: "in-store-boost",
    expiryDate: null,
    citations: [{ source: "manual", sourceUrl: "/" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    ...over,
  };
}

export function makeSignal(over: Partial<OzBargainSignal> = {}): OzBargainSignal {
  return {
    id: "sig-1",
    merchantId: "myer",
    title: "Sample deal",
    summary: "Our own short paraphrase.",
    votesSample: null,
    sentiment: "neutral",
    dealKind: "discount-code",
    sourceUrl: "https://example.com/signal",
    postedAt: null,
    confidence: "needs-verification",
    lastCheckedAt: "2026-06-12T00:00:00+10:00",
    isSample: true,
    ...over,
  };
}

export function makeStackData(over: Partial<StackData> = {}): StackData {
  return {
    stores: [],
    giftCardOffers: [],
    cashbackOffers: [],
    pointsOffers: [],
    ozBargainSignals: [],
    ...over,
  };
}
