import {
  cashbackOffers as staticCashback,
  giftCardOffers as staticGiftCards,
  ozBargainSignals as staticSignals,
  pointsOffers as staticPoints,
} from "@/lib/offers/manualOffers";
import type {
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
} from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";
import {
  fromDbOrStatic,
  toNumber,
  toNumberOrNull,
  type DbClient,
} from "@/lib/supabase/server";

/**
 * Offers repository (gift cards, cashback, points, OzBargain signals).
 *
 * DB reads go through the anon client, so RLS applies — only published offers
 * and `status = 'approved'` signals are returned. Anything missing/failed/empty
 * falls back to the static arrays from lib/offers/manualOffers.ts. Rows are
 * mapped back to the existing TypeScript shapes.
 */

// ── Gift cards ───────────────────────────────────────────────────────────────
interface GiftCardRow {
  id: string;
  brand: string;
  discount_percent: number | string;
  channel: GiftCardOffer["channel"];
  source: string;
  accepted_at_merchant_ids: string[];
  points_on_purchase: GiftCardOffer["pointsOnPurchase"];
  cap_dollars: number | string | null;
  expiry_date: string | null;
  start_date: string | null;
  purchase_location: string | null;
  purchase_method: NonNullable<GiftCardOffer["purchaseMethod"]> | null;
  limit_per_customer: string | null;
  accepted_at: string[];
  usage_notes: string[];
  stack_notes: string[];
  source_detail_url: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
}

function mapGiftCard(r: GiftCardRow): GiftCardOffer {
  return {
    id: r.id,
    brand: r.brand,
    discountPercent: toNumber(r.discount_percent),
    channel: r.channel,
    source: r.source,
    acceptedAtMerchantIds: r.accepted_at_merchant_ids ?? [],
    pointsOnPurchase: r.points_on_purchase ?? null,
    capDollars: toNumberOrNull(r.cap_dollars),
    expiryDate: r.expiry_date,
    startDate: r.start_date,
    purchaseLocation: r.purchase_location ?? undefined,
    purchaseMethod: r.purchase_method ?? undefined,
    limitPerCustomer: r.limit_per_customer ?? undefined,
    acceptedAt: r.accepted_at ?? undefined,
    usageNotes: r.usage_notes ?? undefined,
    stackNotes: r.stack_notes ?? undefined,
    sourceDetailUrl: r.source_detail_url ?? undefined,
    citations: r.citations ?? [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
  };
}

export function getGiftCardOffers(): Promise<GiftCardOffer[]> {
  return fromDbOrStatic("gift_card_offers", staticGiftCards, async (db: DbClient) => {
    const { data, error } = await db.from("gift_card_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as GiftCardRow[]).map(mapGiftCard);
  });
}

// ── Cashback (ShopBack / TopCashback only) ───────────────────────────────────
interface CashbackRow {
  id: string;
  merchant_id: string;
  provider: CashbackOffer["provider"];
  rate_percent: number | string;
  flat_amount: number | string | null;
  cap_dollars: number | string | null;
  is_upsized: boolean;
  excludes_gift_card_payment: boolean;
  terms_summary: string;
  expiry_date: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
}

function mapCashback(r: CashbackRow): CashbackOffer {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    provider: r.provider,
    ratePercent: toNumber(r.rate_percent),
    flatAmount: toNumberOrNull(r.flat_amount),
    capDollars: toNumberOrNull(r.cap_dollars),
    isUpsized: r.is_upsized,
    excludesGiftCardPayment: r.excludes_gift_card_payment,
    termsSummary: r.terms_summary,
    expiryDate: r.expiry_date,
    citations: r.citations ?? [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
  };
}

export function getCashbackOffers(): Promise<CashbackOffer[]> {
  return fromDbOrStatic("cashback_offers", staticCashback, async (db: DbClient) => {
    const { data, error } = await db.from("cashback_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as CashbackRow[]).map(mapCashback);
  });
}

// ── Points ───────────────────────────────────────────────────────────────────
interface PointsRow {
  id: string;
  merchant_id: string | null;
  program: string;
  earn_rate_display: string;
  earn_multiple: number | string | null;
  point_value_cents: number | string | null;
  mechanism: PointsOffer["mechanism"];
  expiry_date: string | null;
  citations: Citation[];
  confidence: Confidence;
  last_checked_at: string;
}

function mapPoints(r: PointsRow): PointsOffer {
  return {
    id: r.id,
    merchantId: r.merchant_id,
    program: r.program,
    earnRateDisplay: r.earn_rate_display,
    earnMultiple: toNumberOrNull(r.earn_multiple),
    pointValueCents: toNumberOrNull(r.point_value_cents),
    mechanism: r.mechanism,
    expiryDate: r.expiry_date,
    citations: r.citations ?? [],
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
  };
}

export function getPointsOffers(): Promise<PointsOffer[]> {
  return fromDbOrStatic("points_offers", staticPoints, async (db: DbClient) => {
    const { data, error } = await db.from("points_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as PointsRow[]).map(mapPoints);
  });
}

// ── OzBargain signals (RLS returns status = 'approved' only) ─────────────────
interface SignalRow {
  id: string;
  source_native_id: string | null;
  merchant_id: string | null;
  title: string;
  summary: string;
  votes_sample: number | null;
  comment_count: number | null;
  sentiment: OzBargainSignal["sentiment"];
  deal_kind: OzBargainSignal["dealKind"];
  source_url: string;
  merchant_url: string | null;
  product_url: string | null;
  posted_at: string | null;
  expiry_date: string | null;
  tags: string[];
  promo_code: string | null;
  price_text: string | null;
  signal_score: number | string | null;
  confidence: Confidence;
  last_checked_at: string;
  is_sample: boolean;
  status: NonNullable<OzBargainSignal["status"]>;
}

function mapSignal(r: SignalRow): OzBargainSignal {
  return {
    id: r.id,
    sourceNativeId: r.source_native_id,
    merchantId: r.merchant_id,
    title: r.title,
    summary: r.summary,
    votesSample: r.votes_sample,
    commentCount: r.comment_count,
    sentiment: r.sentiment,
    dealKind: r.deal_kind,
    sourceUrl: r.source_url,
    merchantUrl: r.merchant_url,
    productUrl: r.product_url,
    postedAt: r.posted_at,
    expiryDate: r.expiry_date,
    tags: r.tags ?? [],
    promoCode: r.promo_code,
    priceText: r.price_text,
    signalScore: toNumberOrNull(r.signal_score),
    confidence: r.confidence,
    lastCheckedAt: r.last_checked_at,
    isSample: r.is_sample,
    status: r.status,
  };
}

export function getOzBargainSignals(): Promise<OzBargainSignal[]> {
  return fromDbOrStatic("ozbargain_signals", staticSignals, async (db: DbClient) => {
    const { data, error } = await db
      .from("ozbargain_signals")
      .select("*")
      .order("signal_score", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as unknown as SignalRow[]).map(mapSignal);
  });
}
