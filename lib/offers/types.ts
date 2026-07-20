import type {
  Citation,
  Confidence,
  DealKind,
} from "@/lib/sources/types";

/**
 * Weekly-deal domain model (Phase 1A).
 *
 * This layer sits ALONGSIDE the existing flat `Store` model in lib/data.ts and
 * the raw per-source `DealSourceResult` in lib/sources/types.ts — it does not
 * replace either yet. Offer entities here are merchant-keyed, typed views that
 * the stack engine (lib/stack) consumes to produce StackRecommendations.
 *
 * Reused from lib/sources/types.ts so we keep one vocabulary:
 *   - Confidence : "confirmed" | "needs-verification" | "expired-unknown"
 *   - Citation   : { source, sourceUrl }
 *   - DealKind   : "discount-code" | "cashback" | "gift-card" | "points" | "guide"
 *
 * All offer data is static/manual sample data — see lib/offers/manualOffers.ts.
 */

/** Cashback is only ever sourced from these two providers. */
export type CashbackProvider = "ShopBack" | "TopCashback";

/** Which of the four stackable layers an offer/component belongs to. */
export type StackLayer = "discount" | "gift-card" | "cashback" | "points";

/** Drives which weekly card an item surfaces in (§4 of the plan). */
export type WeeklyHighlight =
  | "best-stack"
  | "gift-card"
  | "points"
  | "cashback"
  | "signal"
  | "needs-verification";

// ─── Offer entities ───────────────────────────────────────────────────────

/** Structured purchase limits for a gift-card promotion. All optional — only
 * limits the source actually states are recorded; absent means "not stated". */
export interface GiftCardPurchaseLimits {
  /** Total eligible cards per customer/account across the promotion. */
  totalCards?: number | null;
  /** Daily cap for fixed-value (pre-loaded denomination) cards. */
  fixedValueCardsPerDay?: number | null;
  /** Daily cap for variable-load cards — a separate condition, never merged. */
  variableLoadCardsPerDay?: number | null;
}

export interface GiftCardOffer {
  id: string;
  /** Brand of the gift card, e.g. "Coles Group", "Ultimate", "TCN", "Apple". */
  brand: string;
  /** Discount off face value, as a percentage. */
  discountPercent: number;
  channel: "membership-portal" | "supermarket-promo" | "bank-benefit";
  /** Where the card is bought from, e.g. "RACV", "Suncorp Benefits", "Coles". */
  source: string;
  /** Store.ids (lib/data.ts) where this card can be spent. */
  acceptedAtMerchantIds: string[];
  /** Points earned for buying the card itself (a key stacking trick), if any. */
  pointsOnPurchase: { program: string; earnNote: string } | null;
  /** Max SPEND the discount applies to per order/transaction (e.g. "up to $500 of gift cards"); null = uncapped. */
  capDollars: number | null;
  expiryDate: string | null;
  startDate: string | null;
  // ── GCDB-style practical details (all optional, backward-compatible) ──
  /** Where the card is bought, e.g. "RACV Member Benefits portal". */
  purchaseLocation?: string | null;
  purchaseMethod?: "online" | "in-store" | "online-and-in-store" | "unknown";
  /** Stated per-customer / per-transaction limit, human-readable. */
  limitPerCustomer?: string | null;
  /** Human-readable retailers where the card can be spent. */
  acceptedAt?: string[];
  /** Short practical usage notes (our wording). */
  usageNotes?: string[];
  /** How this card stacks with codes / cashback / points (our wording). */
  stackNotes?: string[];
  /** Link to a fuller offer-detail page at the source, if any. */
  sourceDetailUrl?: string | null;
  // ── Structured promotion values (migration 021; all optional) ──
  /** Atomic acquisition mechanic. `mixed` is staging-only and must not publish. */
  promotionType?:
    | "discount"
    | "fixed-dollar-discount"
    | "bonus-value"
    | "points"
    | "promo-credit"
    | "fee-waiver"
    | "membership"
    | "mixed";
  /** "10% bonus value" style promotions (NOT a percentage off). */
  bonusPercent?: number | null;
  /** "20x points" style promotions. */
  pointsMultiplier?: number | null;
  /** A fixed points award, kept distinct from a spend multiplier. */
  fixedPoints?: number | null;
  pointsProgram?: string | null;
  /** Cents-per-point for the disclosed valuation (overrides the default). */
  pointsValueCents?: number | null;
  /** Fixed amount removed at checkout, with thresholdDollars required. */
  fixedDiscountDollars?: number | null;
  /** Future seller-account credit, not a checkout discount. */
  promoCreditDollars?: number | null;
  /** Purchase fee removed by this offer; null when the amount is not stated. */
  feeWaiverDollars?: number | null;
  /** Qualifying gift-card spend/face value for fixed-dollar mechanics. */
  thresholdDollars?: number | null;
  rewardDestination?:
    | "checkout-discount"
    | "gift-card-value"
    | "seller-credit"
    | "loyalty-points"
    | "waived-fee"
    | null;
  /** Null expiry is only ongoing when this explicit reviewed flag is true. */
  isOngoing?: boolean;
  /** Targeted offers are not generally available to every eligible member. */
  targeted?: boolean;
  /** Stable source-child identity for compound campaign lineage. */
  sourceSubOfferKey?: string | null;
  membershipRequired?: boolean;
  activationRequired?: boolean;
  couponRequired?: boolean;
  minSpend?: number | null;
  denominationNote?: string | null;
  format?: "digital" | "physical" | "digital-and-physical" | "unknown";
  /** Human source name, e.g. "Gift Card Database". */
  sourceName?: string | null;
  productId?: string | null;
  sourceLastSeenAt?: string | null;
  // ── Structured detail terms (migration 022; all optional) ──
  /** The literal promo code entered at checkout, when published. */
  promoCode?: string | null;
  /** Exact end time on expiryDate as "HH:MM" 24h (e.g. "23:59"). */
  expiryTime?: string | null;
  /** Timezone label the seller states for expiryTime (e.g. "AEST"). */
  expiryTimezone?: string | null;
  /** Stated number of uses per customer (limitPerCustomer keeps the prose). */
  usesPerCustomer?: number | null;
  /** Physical cards may attract a shipping fee. */
  shippingMayApply?: boolean;
  /** true = Australian customers only; false = broader; null/undefined = unknown. */
  australiaOnly?: boolean | null;
  /** false = explicitly cannot combine with the seller's other promos; null = not stated. */
  combinableWithSellerPromotions?: boolean | null;
  /** The seller/issuer's official terms page for this promotion. */
  termsUrl?: string | null;
  /** Every gift-card product included in the promotion (productId is the primary). */
  includedProductIds?: string[];
  /**
   * Structured purchase limits (migration 034, authored not yet applied —
   * honest null pre-apply; `limitPerCustomer` keeps the source prose).
   * Distinct per-day limits for fixed-value vs variable-load cards are kept
   * separate — they are different conditions, not one number.
   */
  purchaseLimits?: GiftCardPurchaseLimits | null;
  citations: Citation[];
  confidence: Confidence;
  lastCheckedAt: string;
}

/**
 * A gift-card product (the instrument itself, separate from any promotion) —
 * the admin-activated public subset of gift_card_products (RLS is_active).
 */
export interface GiftCardProduct {
  id: string;
  brand: string;
  slug: string;
  issuer: string | null;
  cardNetwork: "visa" | "mastercard" | "eftpos" | "closed-loop" | "unknown" | null;
  format: "digital" | "physical" | "digital-and-physical" | "unknown";
  variableLoad: boolean | null;
  minDenomination: number | null;
  maxDenomination: number | null;
  categoryRestricted: boolean;
  /** MCCs the card is known to work at. Empty = not recorded, NOT "none". */
  supportedMccs: number[];
  /** MCCs the card is known NOT to work at. Empty = not recorded. */
  unsupportedMccs: number[];
  mobileWallet: "supported" | "unsupported" | "partial" | "unknown";
  redemptionNotes: string | null;
  // ── Migration 028 (authored, not yet applied) — honest null pre-apply ──
  /** Alternate product names for alias resolution. Empty = none recorded. */
  aliases: string[];
  officialProductPage: string | null;
  activationMethod: string | null;
  /** Tri-state: true/false = recorded, null = unknown. */
  onlineAvailable: boolean | null;
  inStoreAvailable: boolean | null;
  /** Known face-value denominations. null = unknown (distinct from []). */
  denominations: number[] | null;
  /**
   * Purchase fee per denomination, dollars, keyed by the denomination as a
   * string (e.g. { "100": 5.95, "200": 7.95 } for eftpos cards). null =
   * unknown; {} = explicitly recorded fee-free. Migration 034 (authored, not
   * yet applied) — honest null pre-apply.
   */
  purchaseFees: Record<string, number> | null;
  activationDelayNote: string | null;
  splitPayment: "supported" | "unsupported" | "partial" | "unknown";
  expiryOrFeesNote: string | null;
}

/**
 * One admin-published merchant-acceptance fact for a gift-card product
 * (RLS is_public). `status` is the acceptance confidence tier.
 */
export interface GiftCardAcceptanceRow {
  id: string;
  productId: string;
  storeId: string | null;
  merchantName: string | null;
  merchantCategory: string | null;
  mcc: number | null;
  status: "verified" | "claimed" | "community";
  outcome: "successful" | "unsuccessful" | null;
  sourceUrl: string | null;
  checkedAt: string | null;
  notes: string | null;
  /** Canonical migration-028 acceptance state. Legacy rows are mapped at read time. */
  acceptanceStatus: GiftCardAcceptanceStatus;
  evidenceSourceType: GiftCardAcceptanceEvidenceType | null;
  /** Optional display name used only to attribute official evidence. */
  evidencePublisher: string | null;
  evidenceUrl: string | null;
  evidenceCapturedAt: string | null;
  lastCheckedAt: string | null;
  acceptsOnline: boolean | null;
  acceptsInStore: boolean | null;
  acceptsApp: boolean | null;
  acceptsPhone: boolean | null;
  validFrom: string | null;
  validUntil: string | null;
  limitations: string | null;
  region: string;
  participatingLocationRequired: boolean | null;
}

export type GiftCardAcceptanceStatus =
  | "confirmed-accepted"
  | "confirmed-not-accepted"
  | "likely-accepted"
  | "unofficially-reported"
  | "requires-verification"
  | "stale"
  | "unknown";

export type GiftCardAcceptanceEvidenceType =
  | "issuer-official"
  | "merchant-official"
  | "terms"
  | "card-network-mcc"
  | "gcdb"
  | "specialist"
  | "community";

export interface CashbackOffer {
  id: string;
  merchantId: string;
  provider: CashbackProvider;
  ratePercent: number;
  flatAmount: number | null;
  /** Max cashback DOLLARS for one transaction (e.g. "capped at $30"); null = uncapped. */
  capDollars: number | null;
  /** Limited-time boosted rate — flagged in the UI later. */
  isUpsized: boolean;
  /** Most AU cashback voids when you pay with gift cards — critical for risk logic. */
  excludesGiftCardPayment: boolean;
  termsSummary: string;
  expiryDate: string | null;
  citations: Citation[];
  confidence: Confidence;
  lastCheckedAt: string;
}

export interface PointsOffer {
  id: string;
  merchantId: string | null;
  program: string;
  /** Human-readable rate, e.g. "20x Everyday Rewards / $1". */
  earnRateDisplay: string;
  /** Numeric multiplier for math, null when display-only. */
  earnMultiple: number | null;
  /** Assumed value of one point in cents, for effective-price estimates. */
  pointValueCents: number | null;
  mechanism: "in-store-boost" | "card-linked" | "shopping-portal" | "base-earn";
  expiryDate: string | null;
  citations: Citation[];
  confidence: Confidence;
  lastCheckedAt: string;
}

/** Kinds of credit-card / bank offer (matches the card_offers DB CHECK constraint). */
export type CardOfferType =
  | "sign_up_bonus"
  | "cashback"
  | "statement_credit"
  | "points_bonus"
  | "annual_fee_discount";

export interface CardBonusStage {
  points: number;
  requirement: string;
  timing: string;
  withinFirstYear: boolean;
}

export interface CardOffer {
  id: string;
  provider: string;
  cardName: string;
  offerType: CardOfferType;
  bonusPoints: number | null;
  cashbackAmount: number | null;
  statementCreditAmount: number | null;
  minimumSpend: number | null;
  minimumSpendPeriod: string | null;
  annualFee: number | null;
  bonusStages: CardBonusStage[];
  pointValueCents: number | null;
  eligibilityNotes: string;
  offerSummary: string;
  sourceUrl: string;
  confidence: Confidence;
  expiryDate: string | null;
  /** Mandatory editorial freshness deadline, independent of issuer expiry. */
  reviewByDate: string;
  lastCheckedAt: string;
}

export interface CardOfferHistoryEntry {
  id: string;
  cardOfferId: string;
  changeSummary: string;
  changedFields: string[];
  checkedAt: string;
  createdAt: string;
}

export interface OzBargainSignal {
  id: string;
  merchantId: string | null;
  title: string;
  /** Our own short paraphrase, never copied content. */
  summary: string;
  /** Community heat — sample value only. */
  votesSample: number | null;
  sentiment: "hot" | "neutral" | "warning" | "expired";
  dealKind: DealKind;
  sourceUrl: string;
  postedAt: string | null;
  confidence: Confidence;
  lastCheckedAt: string;
  /**
   * True for static/manual MVP examples — `sourceUrl` is a placeholder, not a
   * real OzBargain post, and must NOT be rendered as a live link. The future
   * source-monitoring agent emits real signals with `isSample: false`.
   */
  isSample: boolean;
  // ── Optional enrichment (static MVP; populated where known) ──
  /** Number of comments on the source thread — heat signal only. */
  commentCount?: number | null;
  /** Short tag/category labels (our wording). */
  tags?: string[];
  /** Community-posted promo code, if cleanly visible. */
  promoCode?: string | null;
  /** Short price/discount text, e.g. "$1,799 (was $1,999)". */
  priceText?: string | null;
  /** Offer expiry if stated by the post. */
  expiryDate?: string | null;
  /** 0–1 heuristic signal score (see scoring plan). */
  signalScore?: number | null;
  /** Stable OzBargain node id, for future dedupe. */
  sourceNativeId?: string | null;
  /** Moderation status (future use). */
  status?: "pending" | "approved" | "hidden" | "expired";
  /** Retailer homepage the post points to, if any. */
  merchantUrl?: string | null;
  /** Exact product/category page at the retailer, if the post points to one. */
  productUrl?: string | null;
  /**
   * Admin-assigned key linking signals for the SAME product across retailers
   * (e.g. "airpods-pro-3"). Search groups shared-key signals into one product
   * with a retailer price-comparison. Null = ungrouped (renders standalone).
   */
  productGroup?: string | null;
}

export interface WeeklyDeal {
  id: string;
  /** ISO Monday of the week this deal belongs to, e.g. "2026-06-08". */
  weekOf: string;
  merchantId: string | null;
  title: string;
  /** ≤200 char paraphrase, our wording. */
  summary: string;
  highlight: WeeklyHighlight;
  /** Ids of the offer entities this deal references. */
  componentIds: string[];
  citations: Citation[];
  expiryDate: string | null;
  confidence: Confidence;
}

// ─── Stack engine output (lib/stack/buildStack.ts) ─────────────────────────

export interface StackComponent {
  layer: StackLayer;
  /** Canonical offer id when this component came from a gift-card offer. */
  sourceOfferId?: string;
  label: string;
  valuePercent?: number;
  /** Dollar value of this layer against the example spend. */
  valueDollars?: number;
  /** Copy-able coupon code for a discount layer, when one exists. */
  code?: string;
  pointsEarned?: number;
  /** True when this layer is a "could add" rather than part of the chosen stack. */
  optional: boolean;
  citation: Citation;
  confidence: Confidence;
  note?: string;
  /** Structured gift-card compatibility verdict for this layer, when applicable. */
  compatibilityStatus?:
    | "compatible"
    | "likely-compatible"
    | "incompatible"
    | "requires-verification"
    | "insufficient-evidence";
  /** One-sentence human-readable reason behind compatibilityStatus. */
  compatibilityReason?: string;
  /** Actionable caveats from the shared two-stage gift-card analysis. */
  compatibilityWarnings?: string[];
  /** Acquisition and redemption stay distinct so the UI can explain each. */
  compatibilityStages?: {
    acquisition: {
      status: GiftCardCompatibilityStatus;
      reason: string;
    };
    redemption: {
      status: GiftCardCompatibilityStatus;
      reason: string;
    };
  };
}

export type GiftCardCompatibilityStatus =
  | "compatible"
  | "likely-compatible"
  | "incompatible"
  | "requires-verification"
  | "insufficient-evidence";

export type StackWarningLevel = "info" | "caution" | "risk";

export type StackWarningCode =
  | "gift-card-excluded-from-cashback"
  | "gift-card-not-accepted"
  | "gift-card-requires-action"
  | "gift-card-membership-required"
  | "gift-card-activation-required"
  | "gift-card-minimum-spend"
  | "gift-card-usage-limit"
  | "stale-data"
  | "needs-verification"
  | "expiry-soon"
  | "conflicting-terms"
  | "cap-reached";

export interface StackWarning {
  level: StackWarningLevel;
  code: StackWarningCode;
  message: string;
}

/** Alias kept for readability where the domain language is "risk". */
export type StackRisk = StackWarning;

/**
 * How a stack should be presented to a shopper:
 *   - "cash"        : reduces the out-of-pocket price (discount / gift card /
 *                     cashback with a real dollar saving). Qualifies for the
 *                     default Best stacks list.
 *   - "points-only" : the cash price is unchanged; the only benefit is earned
 *                     loyalty points. Surfaced under Rewards opportunities, never
 *                     shown as "0% off".
 */
export type StackKind = "cash" | "points-only";

export interface StackRecommendation {
  merchantId: string;
  merchantName: string;
  title: string;
  /** Cash-saving stack vs a points-only rewards opportunity (set by the engine). */
  kind: StackKind;
  /** Example basket used for the estimate. */
  basePrice: number;
  components: StackComponent[];
  /** Out-of-pocket after discount + gift card + cashback (points not deducted). */
  effectivePrice: number;
  /**
   * What the shopper actually hands over at checkout: base price minus the
   * layers that reduce the payment itself (discount code, discounted gift
   * cards). Cashback is NOT deducted here — it arrives later.
   */
  payAtCheckout: number;
  /** Cashback dollars expected AFTER purchase (0 when no cashback layer used). */
  cashbackLater: number;
  effectiveDiscountPercent: number;
  totalSaving: number;
  /** The subset of totalSaving from CONFIRMED cash layers only. */
  verifiedSaving: number;
  /** Oldest last-checked date among the used offer-backed layers (ISO), or null. */
  checkedAsOf: string | null;
  /** Soonest expiry among the used layers (YYYY-MM-DD), or null when open-ended. */
  soonestExpiry: string | null;
  pointsEarned: number;
  pointsValueDollars: number;
  /** Worst-of all included component confidences. */
  confidence: Confidence;
  warnings: StackWarning[];
  citations: Citation[];
  weekOf: string;
}
