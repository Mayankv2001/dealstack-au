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
  /** Per-transaction or per-offer dollar cap, null if uncapped/unknown. */
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
  citations: Citation[];
  confidence: Confidence;
  lastCheckedAt: string;
}

export interface CashbackOffer {
  id: string;
  merchantId: string;
  provider: CashbackProvider;
  ratePercent: number;
  flatAmount: number | null;
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
  label: string;
  valuePercent?: number;
  /** Dollar value of this layer against the example spend. */
  valueDollars?: number;
  pointsEarned?: number;
  /** True when this layer is a "could add" rather than part of the chosen stack. */
  optional: boolean;
  citation: Citation;
  confidence: Confidence;
  note?: string;
}

export type StackWarningLevel = "info" | "caution" | "risk";

export type StackWarningCode =
  | "gift-card-excluded-from-cashback"
  | "gift-card-not-accepted"
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

export interface StackRecommendation {
  merchantId: string;
  merchantName: string;
  title: string;
  /** Example basket used for the estimate. */
  basePrice: number;
  components: StackComponent[];
  /** Out-of-pocket after discount + gift card + cashback (points not deducted). */
  effectivePrice: number;
  effectiveDiscountPercent: number;
  totalSaving: number;
  pointsEarned: number;
  pointsValueDollars: number;
  /** Worst-of all included component confidences. */
  confidence: Confidence;
  warnings: StackWarning[];
  citations: Citation[];
  weekOf: string;
}
