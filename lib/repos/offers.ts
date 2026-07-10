import {
  cardOffers as staticCardOffers,
  cashbackOffers as staticCashback,
  giftCardOffers as staticGiftCards,
  ozBargainSignals as staticSignals,
  pointsOffers as staticPoints,
} from "@/lib/offers/manualOffers";
import type {
  CardOffer,
  CashbackOffer,
  GiftCardOffer,
  OzBargainSignal,
  PointsOffer,
} from "@/lib/offers/types";
import { filterLive, todayAU } from "@/lib/offers/expiry";
import { isPublicReadyCardOffer } from "@/lib/offers/cardReadiness";
import type { Citation, Confidence } from "@/lib/sources/types";
import {
  fromDbOrDemo,
  fromDbOrStatic,
  getSupabaseServer,
  isStaticDataSource,
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

export async function getGiftCardOffers(): Promise<GiftCardOffer[]> {
  // filterLive wraps the fallback result (not the query callback) so expired
  // rows can't trigger the zero-rows static fallback, and static rows are
  // themselves guarded. Same pattern for every public getter below.
  const rows = await fromDbOrStatic("gift_card_offers", staticGiftCards, async (db: DbClient) => {
    const { data, error } = await db.from("gift_card_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as GiftCardRow[]).map(mapGiftCard);
  });
  return filterLive(rows);
}

// ── Card offers (bank / credit-card sign-up bonuses) ─────────────────────────
interface CardOfferRow {
  id: string;
  provider: string;
  card_name: string;
  offer_type: CardOffer["offerType"];
  bonus_points: number | string | null;
  cashback_amount: number | string | null;
  statement_credit_amount: number | string | null;
  minimum_spend: number | string | null;
  minimum_spend_period: string | null;
  annual_fee: number | string | null;
  eligibility_notes: string;
  offer_summary: string;
  source_url: string;
  confidence: Confidence;
  expiry_date: string | null;
  last_checked_at: string;
}

function mapCardOffer(r: CardOfferRow): CardOffer {
  return {
    id: r.id,
    provider: r.provider,
    cardName: r.card_name,
    offerType: r.offer_type,
    bonusPoints: toNumberOrNull(r.bonus_points),
    cashbackAmount: toNumberOrNull(r.cashback_amount),
    statementCreditAmount: toNumberOrNull(r.statement_credit_amount),
    minimumSpend: toNumberOrNull(r.minimum_spend),
    minimumSpendPeriod: r.minimum_spend_period,
    annualFee: toNumberOrNull(r.annual_fee),
    eligibilityNotes: r.eligibility_notes,
    offerSummary: r.offer_summary,
    sourceUrl: r.source_url,
    confidence: r.confidence,
    expiryDate: r.expiry_date,
    lastCheckedAt: r.last_checked_at,
  };
}

/**
 * RLS on card_offers already restricts anon reads to is_published = true.
 *
 * Uses fromDbOrDemo (NOT fromDbOrStatic): the static card offers are hand-typed
 * demo rows with illustrative figures, so they are only ever shown in local/demo
 * mode (Supabase unconfigured or DATA_SOURCE=static). With Supabase configured,
 * zero published rows renders the /cards empty state and a read error returns
 * no rows — the demo data is never served as if it were live.
 */
interface CardOfferReadDeps {
  /** Test-only mode/client injection, mirroring fromDbOrDemo. */
  staticMode?: boolean;
  client?: DbClient | null;
  today?: string;
}

export async function getCardOffers(
  deps: CardOfferReadDeps = {}
): Promise<CardOffer[]> {
  const staticMode = deps.staticMode ?? isStaticDataSource();
  const client =
    deps.client !== undefined
      ? deps.client
      : staticMode
        ? null
        : getSupabaseServer();
  const demoMode = staticMode || client == null;
  const today = deps.today ?? todayAU();
  const rows = await fromDbOrDemo(
    "card_offers",
    staticCardOffers,
    async (db: DbClient) => {
      const { data, error } = await db.from("card_offers").select("*");
      if (error) throw error;
      return ((data ?? []) as unknown as CardOfferRow[]).map(mapCardOffer);
    },
    { staticMode, client }
  );
  const liveRows = filterLive(rows, today);

  // Illustrative manual rows are useful in local/demo mode. Once Supabase is
  // configured, only independently public-ready DB rows may reach /cards.
  return demoMode
    ? liveRows
    : liveRows.filter((offer) => isPublicReadyCardOffer(offer, today));
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

export async function getCashbackOffers(): Promise<CashbackOffer[]> {
  const rows = await fromDbOrStatic("cashback_offers", staticCashback, async (db: DbClient) => {
    const { data, error } = await db.from("cashback_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as CashbackRow[]).map(mapCashback);
  });
  return filterLive(rows);
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

export async function getPointsOffers(): Promise<PointsOffer[]> {
  const rows = await fromDbOrStatic("points_offers", staticPoints, async (db: DbClient) => {
    const { data, error } = await db.from("points_offers").select("*");
    if (error) throw error;
    return ((data ?? []) as unknown as PointsRow[]).map(mapPoints);
  });
  return filterLive(rows);
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

export async function getOzBargainSignals(): Promise<OzBargainSignal[]> {
  const rows = await fromDbOrStatic("ozbargain_signals", staticSignals, async (db: DbClient) => {
    const { data, error } = await db
      .from("ozbargain_signals")
      .select("*")
      .order("signal_score", { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as unknown as SignalRow[]).map(mapSignal);
  });
  return filterLive(rows);
}
