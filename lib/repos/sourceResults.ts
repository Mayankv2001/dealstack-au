import { cardOfferReadiness } from "@/lib/offers/cardReadiness";
import type { CardOfferType } from "@/lib/offers/types";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { cardOfferToSourceResult, type CardOfferSourceInput } from "@/lib/sources/cardResults";
import {
  rankSourceResults,
  rankSourceResultsForStore,
  searchSources,
  sourceResultsForStore,
} from "@/lib/sources/searchSources";
import {
  SOURCE_META,
  type Confidence,
  type DealKind,
  type DealSourceResult,
  type RankedDealResult,
} from "@/lib/sources/types";
import {
  getSupabaseServer,
  isStaticDataSource,
  toNumber,
  toNumberOrNull,
  type DbClient,
} from "@/lib/supabase/server";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { reportOperationalError } from "@/lib/observability/report-server-error";

/**
 * Source-checks adapter — Supabase-backed "Checked sources" results.
 *
 * Converts the published offers and approved OzBargain signals into the existing
 * `DealSourceResult` shape, then runs them through the SAME dedupe/derive/rank
 * pipeline the static sample pool uses (lib/sources/searchSources.ts). The public
 * search/store pages render the output with the unchanged SourceResultCard.
 *
 * Reads go through the ANON client (getSupabaseServer), so RLS applies — only
 * `is_published = true` offers and `status = 'approved'` signals come back
 * (requirement: only approved/published records show publicly).
 *
 * Trust boundary (same contract as lib/repos/offers.ts):
 *   - DATA_SOURCE=static, or Supabase env missing → loadDbSourceResults()
 *     returns null and callers defer to the static searchSources()/
 *     sourceResultsForStore() demo pipeline (local/demo mode only).
 *   - Supabase configured → loadDbSourceResults() returns an array, even when
 *     EMPTY. A query error is logged and treated as zero rows ([]), and hard-
 *     expired rows plus not-yet-public-ready card offers are filtered out
 *     before ranking. The static demo pool is NEVER resurrected once Supabase
 *     is configured — an empty/erroring DB renders the checked-sources empty
 *     state, not stale samples.
 *
 * No scraping / agents / external source requests live here — it only reads our
 * own Supabase project. Cashback is ShopBack/TopCashback only (never Cashrewards).
 */

// Cashback "View source" points at the provider the shopper actually uses. Only
// the two permitted providers exist; Cashrewards is never present.
const CASHBACK_PROVIDER_HOMEPAGE: Record<string, string> = {
  ShopBack: "https://www.shopback.com.au",
  TopCashback: "https://www.topcashback.com.au",
};

const DEAL_KINDS: DealKind[] = [
  "discount-code",
  "cashback",
  "gift-card",
  "points",
  "guide",
];

function asDealKind(value: string): DealKind {
  return (DEAL_KINDS as string[]).includes(value)
    ? (value as DealKind)
    : "guide";
}

// ── Row shapes (only the columns the source cards need) ──────────────────────
export interface StoreNameRow {
  id: string;
  name: string;
}

export interface CashbackResultRow {
  id: string;
  merchant_id: string;
  provider: string;
  rate_percent: number | string;
  terms_summary: string;
  expiry_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
}

export interface GiftCardResultRow {
  id: string;
  brand: string;
  discount_percent: number | string;
  accepted_at_merchant_ids: string[] | null;
  source_detail_url: string | null;
  expiry_date: string | null;
  start_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
}

export interface PointsResultRow {
  id: string;
  merchant_id: string | null;
  program: string;
  earn_rate_display: string;
  expiry_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
}

export interface CardOfferResultRow {
  id: string;
  provider: string;
  card_name: string;
  offer_type: CardOfferType;
  bonus_points: number | string | null;
  cashback_amount: number | string | null;
  statement_credit_amount: number | string | null;
  annual_fee: number | string | null;
  eligibility_notes: string;
  offer_summary: string;
  source_url: string;
  expiry_date: string | null;
  review_by_date: string;
  last_checked_at: string;
  confidence: Confidence;
}

export interface SignalResultRow {
  id: string;
  merchant_id: string | null;
  title: string;
  summary: string;
  deal_kind: string;
  source_url: string;
  posted_at: string | null;
  expiry_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
  is_sample: boolean;
  price_text: string | null;
}

type NameOf = (id: string | null) => string | null;

function buildNameMap(rows: StoreNameRow[]): NameOf {
  const map = new Map(rows.map((r) => [r.id, r.name] as const));
  return (id) => (id ? map.get(id) ?? null : null);
}

// ── Offer/signal → DealSourceResult mappers ──────────────────────────────────

function cashbackToResult(r: CashbackResultRow, nameOf: NameOf): DealSourceResult {
  const merchant = nameOf(r.merchant_id);
  const rate = toNumber(r.rate_percent);
  return {
    id: `cb:${r.id}`,
    source: "manual",
    kind: "cashback",
    title: `${rate}% cashback${merchant ? ` at ${merchant}` : ""} via ${r.provider}`,
    merchant,
    merchantId: r.merchant_id,
    summary: r.terms_summary || `${rate}% cashback through ${r.provider}.`,
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: null,
    cardOrProvider: r.provider,
    expiryDate: r.expiry_date,
    startDate: null,
    sourceUrl:
      CASHBACK_PROVIDER_HOMEPAGE[r.provider] ?? SOURCE_META.manual.homepage,
    publishedAt: null,
    lastCheckedAt: r.last_checked_at,
    confidence: r.confidence,
  };
}

// A gift card can be spent at several stores, so emit one result per accepted
// merchant — that's what lets each store page surface the cards usable there.
function giftCardToResults(
  r: GiftCardResultRow,
  nameOf: NameOf
): DealSourceResult[] {
  const pct = toNumber(r.discount_percent);
  const base = {
    source: "gcdb" as const,
    kind: "gift-card" as const,
    title: `${r.brand} gift cards ${pct}% off`,
    summary: `${r.brand} gift cards at ${pct}% off face value.`,
    discountPercent: pct,
    pointsProgram: null,
    pointsAmount: null,
    giftCardBrand: r.brand,
    cardOrProvider: null,
    expiryDate: r.expiry_date,
    startDate: r.start_date,
    sourceUrl:
      (r.source_detail_url ? safeHttpsUrl(r.source_detail_url) : null) ??
      SOURCE_META.gcdb.homepage,
    publishedAt: null,
    lastCheckedAt: r.last_checked_at,
    confidence: r.confidence,
  };
  const merchants = r.accepted_at_merchant_ids ?? [];
  if (merchants.length === 0) {
    return [{ ...base, id: `gc:${r.id}`, merchant: null, merchantId: null }];
  }
  return merchants.map((mid) => ({
    ...base,
    id: `gc:${r.id}:${mid}`,
    merchant: nameOf(mid),
    merchantId: mid,
  }));
}

function pointsToResult(r: PointsResultRow, nameOf: NameOf): DealSourceResult {
  const merchant = nameOf(r.merchant_id);
  return {
    id: `pts:${r.id}`,
    source: "freepoints",
    kind: "points",
    title: merchant
      ? `${r.program} points at ${merchant}`
      : `${r.program} points offer`,
    merchant,
    merchantId: r.merchant_id,
    summary: r.earn_rate_display
      ? `Earn ${r.earn_rate_display}.`
      : `${r.program} points offer.`,
    discountPercent: null,
    pointsProgram: r.program,
    pointsAmount: r.earn_rate_display || null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: r.expiry_date,
    startDate: null,
    sourceUrl: SOURCE_META.freepoints.homepage,
    publishedAt: null,
    lastCheckedAt: r.last_checked_at,
    confidence: r.confidence,
  };
}

function cardOfferRowToInput(r: CardOfferResultRow): CardOfferSourceInput {
  return {
    id: r.id,
    provider: r.provider,
    cardName: r.card_name,
    bonusPoints: toNumberOrNull(r.bonus_points),
    cashbackAmount: toNumberOrNull(r.cashback_amount),
    statementCreditAmount: toNumberOrNull(r.statement_credit_amount),
    offerSummary: r.offer_summary,
    sourceUrl: r.source_url,
    expiryDate: r.expiry_date,
    lastCheckedAt: r.last_checked_at,
    confidence: r.confidence,
  };
}

// Same public-readiness rule as /cards (lib/repos/offers.ts): a card offer is
// only shown publicly once it's independently public-ready, not merely live.
function cardOfferRowIsPublicReady(
  r: CardOfferResultRow,
  today: string
): boolean {
  return cardOfferReadiness(
    {
      provider: r.provider,
      cardName: r.card_name,
      offerType: r.offer_type,
      bonusPoints: toNumberOrNull(r.bonus_points),
      cashbackAmount: toNumberOrNull(r.cashback_amount),
      statementCreditAmount: toNumberOrNull(r.statement_credit_amount),
      annualFee: toNumberOrNull(r.annual_fee),
      eligibilityNotes: r.eligibility_notes,
      offerSummary: r.offer_summary,
      sourceUrl: r.source_url,
      confidence: r.confidence,
      expiryDate: r.expiry_date,
      reviewByDate: r.review_by_date,
    },
    today
  ).ready;
}

function signalToResult(r: SignalResultRow, nameOf: NameOf): DealSourceResult {
  return {
    id: `sig:${r.id}`,
    source: "ozbargain",
    kind: asDealKind(r.deal_kind),
    title: r.title,
    merchant: nameOf(r.merchant_id),
    merchantId: r.merchant_id,
    // Keep sample signals clearly labelled wherever they surface.
    summary: r.is_sample ? `Sample signal — ${r.summary}` : r.summary,
    discountPercent: null,
    pointsProgram: null,
    pointsAmount: r.price_text || null,
    giftCardBrand: null,
    cardOrProvider: null,
    expiryDate: r.expiry_date,
    startDate: null,
    // Sample signals carry placeholder source URLs that must never be linked as
    // live posts — point them at the OzBargain homepage. Real signals keep their
    // canonical source_url.
    sourceUrl: r.is_sample ? SOURCE_META.ozbargain.homepage : r.source_url,
    publishedAt: r.posted_at,
    lastCheckedAt: r.last_checked_at,
    confidence: r.confidence,
  };
}

// ── DB reads (anon client → RLS-filtered to published/approved) ──────────────

async function queryStoreNames(db: DbClient): Promise<StoreNameRow[]> {
  const { data, error } = await db.from("stores").select("id, name");
  if (error) throw error;
  return (data ?? []) as unknown as StoreNameRow[];
}

async function queryCashback(db: DbClient): Promise<CashbackResultRow[]> {
  const { data, error } = await db
    .from("cashback_offers")
    .select(
      "id, merchant_id, provider, rate_percent, terms_summary, expiry_date, last_checked_at, confidence"
    );
  if (error) throw error;
  return (data ?? []) as unknown as CashbackResultRow[];
}

async function queryGiftCards(db: DbClient): Promise<GiftCardResultRow[]> {
  const { data, error } = await db
    .from("gift_card_offers")
    .select(
      "id, brand, discount_percent, accepted_at_merchant_ids, source_detail_url, expiry_date, start_date, last_checked_at, confidence"
    );
  if (error) throw error;
  return (data ?? []) as unknown as GiftCardResultRow[];
}

async function queryPoints(db: DbClient): Promise<PointsResultRow[]> {
  const { data, error } = await db
    .from("points_offers")
    .select(
      "id, merchant_id, program, earn_rate_display, expiry_date, last_checked_at, confidence"
    );
  if (error) throw error;
  return (data ?? []) as unknown as PointsResultRow[];
}

async function queryCardOffers(db: DbClient): Promise<CardOfferResultRow[]> {
  const { data, error } = await db
    .from("card_offers")
    .select(
      "id, provider, card_name, offer_type, bonus_points, cashback_amount, statement_credit_amount, annual_fee, eligibility_notes, offer_summary, source_url, expiry_date, review_by_date, last_checked_at, confidence"
    );
  if (error) throw error;
  return (data ?? []) as unknown as CardOfferResultRow[];
}

async function querySignals(db: DbClient): Promise<SignalResultRow[]> {
  const { data, error } = await db
    .from("ozbargain_signals")
    .select(
      "id, merchant_id, title, summary, deal_kind, source_url, posted_at, expiry_date, last_checked_at, confidence, is_sample, price_text"
    );
  if (error) throw error;
  return (data ?? []) as unknown as SignalResultRow[];
}

export interface SourceResultRows {
  stores: StoreNameRow[];
  cashback: CashbackResultRow[];
  giftCards: GiftCardResultRow[];
  points: PointsResultRow[];
  cardOffers: CardOfferResultRow[];
  signals: SignalResultRow[];
}

/**
 * Pure pool builder — no Supabase involved, so tests can feed rows directly.
 * Filters each table's hard-expired rows (and not-yet-public-ready card
 * offers) BEFORE mapping to DealSourceResult, so a merchant that has several
 * gift-card fan-out results never leaks a still-expired one through, and a
 * final filterLive-equivalent pass across the mapped pool catches anything
 * a mapper might have missed.
 */
export function buildSourceResultPool(
  rows: SourceResultRows,
  now: Date = new Date()
): DealSourceResult[] {
  const today = todayAU(now);
  const notExpired = (expiryDate: string | null) =>
    !isPastExpiry(expiryDate, today);
  const nameOf = buildNameMap(rows.stores);

  const results: DealSourceResult[] = [
    ...rows.cashback
      .filter((r) => notExpired(r.expiry_date))
      .map((r) => cashbackToResult(r, nameOf)),
    ...rows.giftCards
      .filter((r) => notExpired(r.expiry_date))
      .flatMap((r) => giftCardToResults(r, nameOf)),
    ...rows.points
      .filter((r) => notExpired(r.expiry_date))
      .map((r) => pointsToResult(r, nameOf)),
    ...rows.cardOffers
      .filter((r) => notExpired(r.expiry_date) && cardOfferRowIsPublicReady(r, today))
      .map((r) => cardOfferToSourceResult(cardOfferRowToInput(r))),
    ...rows.signals
      .filter(
        (r) =>
          notExpired(r.expiry_date) &&
          (r.is_sample || safeHttpsUrl(r.source_url) !== null)
      )
      .map((r) => signalToResult(r, nameOf)),
  ];

  return results.filter((r) => notExpired(r.expiryDate));
}

/**
 * The Supabase-backed source-result pool, or null when we should defer to the
 * static demo pool (DATA_SOURCE=static or Supabase env missing — local/demo
 * mode only). Once Supabase is configured, this always returns an array —
 * empty on a query error or on zero public rows — and never null again, so
 * callers never resurrect the static pool for a configured project.
 */
export async function loadDbSourceResults(): Promise<DealSourceResult[] | null> {
  if (isStaticDataSource()) return null;
  const db = getSupabaseServer();
  if (!db) return null;

  try {
    const [storeRows, cashback, giftCards, points, cardOffers, signals] =
      await Promise.all([
        queryStoreNames(db),
        queryCashback(db),
        queryGiftCards(db),
        queryPoints(db),
        queryCardOffers(db),
        querySignals(db),
      ]);
    return buildSourceResultPool({
      stores: storeRows,
      cashback,
      giftCards,
      points,
      cardOffers,
      signals,
    });
  } catch (err) {
    await reportOperationalError("source-results-read", err);
    return [];
  }
}

/**
 * Search the "Checked sources" section. Supabase-backed when available, else the
 * static sample pipeline. Same dedupe/rank output type the UI already renders.
 */
export async function searchSourceResults(
  query: string
): Promise<RankedDealResult[]> {
  const pool = await loadDbSourceResults();
  if (!pool) return searchSources(query);
  return rankSourceResults(pool, query);
}

/** Source results for one store's detail page (Supabase-backed, else static). */
export async function storeSourceResults(
  storeId: string
): Promise<RankedDealResult[]> {
  const pool = await loadDbSourceResults();
  if (!pool) return sourceResultsForStore(storeId);
  return rankSourceResultsForStore(pool, storeId);
}
