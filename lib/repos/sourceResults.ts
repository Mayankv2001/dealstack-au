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
  shouldUseStaticData,
  toNumber,
  type DbClient,
} from "@/lib/supabase/server";

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
 * Static mode is deliberately narrow:
 *   - DATA_SOURCE=static, or an unconfigured local development environment,
 *     uses the sample search pipeline.
 *   - Production query errors and legitimate empty results remain empty so
 *     expired or unpublished sample records cannot appear as live offers.
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
interface StoreNameRow {
  id: string;
  name: string;
}

interface CashbackResultRow {
  id: string;
  merchant_id: string;
  provider: string;
  rate_percent: number | string;
  terms_summary: string;
  expiry_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
}

interface GiftCardResultRow {
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

interface PointsResultRow {
  id: string;
  merchant_id: string | null;
  program: string;
  earn_rate_display: string;
  expiry_date: string | null;
  last_checked_at: string;
  confidence: Confidence;
}

interface SignalResultRow {
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
    sourceUrl: r.source_detail_url ?? SOURCE_META.gcdb.homepage,
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

async function querySignals(db: DbClient): Promise<SignalResultRow[]> {
  const { data, error } = await db
    .from("ozbargain_signals")
    .select(
      "id, merchant_id, title, summary, deal_kind, source_url, posted_at, expiry_date, last_checked_at, confidence, is_sample, price_text"
    );
  if (error) throw error;
  return (data ?? []) as unknown as SignalResultRow[];
}

/**
 * The Supabase-backed source-result pool, or null only in deliberate static
 * demo/development mode. Empty and failed production reads stay empty.
 */
export async function loadDbSourceResults(): Promise<DealSourceResult[] | null> {
  if (shouldUseStaticData()) return null;
  const db = getSupabaseServer();
  if (!db) return [];

  try {
    const [storeRows, cashback, giftCards, points, signals] = await Promise.all([
      queryStoreNames(db),
      queryCashback(db),
      queryGiftCards(db),
      queryPoints(db),
      querySignals(db),
    ]);
    const nameOf = buildNameMap(storeRows);
    const results: DealSourceResult[] = [
      ...cashback.map((r) => cashbackToResult(r, nameOf)),
      ...giftCards.flatMap((r) => giftCardToResults(r, nameOf)),
      ...points.map((r) => pointsToResult(r, nameOf)),
      ...signals.map((r) => signalToResult(r, nameOf)),
    ];
    return results;
  } catch (err) {
    console.warn(
      `[sourceResults] DB read failed; returning no public source checks. ${
        err instanceof Error ? err.message : String(err)
      }`
    );
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
