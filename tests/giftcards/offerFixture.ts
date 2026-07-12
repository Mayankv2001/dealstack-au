import type { GiftCardOffer } from "@/lib/offers/types";

/**
 * Shared fixture builder for the detail-experience tests. The default is the
 * canonical Card.Gift-style promotion: 10% off four TCN cards with promo code
 * FEELING10, ending 17 July 2026 11:59 PM AEST, one use per customer, a
 * $3,000 purchase cap, physical + digital, AU only, shipping may apply,
 * cannot combine with another seller promotion.
 */
export function makeOffer(overrides: Partial<GiftCardOffer> = {}): GiftCardOffer {
  return {
    id: "gc-cardgift-tcn-10",
    brand: "TCN",
    discountPercent: 10,
    channel: "supermarket-promo",
    source: "Card.Gift",
    acceptedAtMerchantIds: [],
    pointsOnPurchase: null,
    capDollars: 3000,
    expiryDate: "2026-07-17",
    startDate: "2026-07-10",
    purchaseLocation: "Card.Gift",
    purchaseMethod: "online",
    limitPerCustomer: "One use per customer",
    acceptedAt: ["Myer", "JB Hi-Fi"],
    usageNotes: [],
    stackNotes: [],
    sourceDetailUrl: "https://gcdb.com.au/example",
    promotionType: "discount",
    bonusPercent: null,
    pointsMultiplier: null,
    pointsProgram: null,
    pointsValueCents: null,
    membershipRequired: false,
    activationRequired: false,
    couponRequired: true,
    minSpend: null,
    denominationNote: null,
    format: "digital-and-physical",
    sourceName: "Gift Card Database",
    productId: "tcn-shop",
    sourceLastSeenAt: "2026-07-12T00:00:00Z",
    promoCode: "FEELING10",
    expiryTime: "23:59",
    expiryTimezone: "AEST",
    usesPerCustomer: 1,
    shippingMayApply: true,
    australiaOnly: true,
    combinableWithSellerPromotions: false,
    termsUrl: "https://card.gift/terms",
    includedProductIds: ["tcn-shop", "tcn-love", "tcn-good-food", "tcn-cinema"],
    citations: [{ source: "gcdb", sourceUrl: "https://gcdb.com.au/example" }],
    confidence: "needs-verification",
    lastCheckedAt: "2026-07-12T00:00:00Z",
    ...overrides,
  };
}

/** A minimal offer with none of the optional detail fields recorded. */
export function makeBareOffer(overrides: Partial<GiftCardOffer> = {}): GiftCardOffer {
  return {
    id: "gc-bare",
    brand: "Ultimate",
    discountPercent: 5,
    channel: "membership-portal",
    source: "RACV Member Benefits",
    acceptedAtMerchantIds: [],
    pointsOnPurchase: null,
    capDollars: null,
    expiryDate: null,
    startDate: null,
    citations: [],
    confidence: "needs-verification",
    lastCheckedAt: "2026-07-12T00:00:00Z",
    ...overrides,
  };
}

/** Clock inside every fixture's validity window. */
export const NOW = new Date("2026-07-12T04:00:00Z");
