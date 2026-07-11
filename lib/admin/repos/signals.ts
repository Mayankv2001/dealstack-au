import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumberOrNull } from "@/lib/supabase/server";
import type { OzBargainSignal } from "@/lib/offers/types";
import type { Confidence, DealKind } from "@/lib/sources/types";

/**
 * Admin-side OzBargain signals repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. The public anon client (see
 * lib/repos/offers.ts) only ever sees status = 'approved' rows; this admin layer
 * sees every signal — pending, approved, hidden and expired — so a human can
 * moderate them. Because of that, this module must only ever be imported by
 * server code that runs behind requireAdmin() — never a client component. The
 * browser guard inside getSupabaseAdmin() is the backstop.
 *
 * Signals are entered by hand here. There is NO OzBargain fetching / scraping /
 * agent in this module — it talks only to our own Supabase project.
 */

/** Moderation lifecycle (matches the DB CHECK constraint). */
export const SIGNAL_STATUSES = [
  "pending",
  "approved",
  "hidden",
  "expired",
] as const;
export type SignalStatus = (typeof SIGNAL_STATUSES)[number];

/** Community-heat sentiment (matches the DB CHECK constraint). */
export const SENTIMENTS = ["hot", "neutral", "warning", "expired"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

/** Kinds of deal a signal can describe (matches the DB CHECK constraint). */
export const DEAL_KINDS: DealKind[] = [
  "discount-code",
  "cashback",
  "gift-card",
  "points",
  "guide",
];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

// The store dropdown is identical to the cashback admin's, so reuse it rather
// than duplicate the query (both are service-role reads of `stores`).
export { listStoreOptions, type StoreOption } from "@/lib/admin/repos/cashback";

/** A signal as the admin sees it — domain shape plus admin-only fields. */
export interface AdminSignal extends OzBargainSignal {
  /** Always present for the admin (the public layer only sees 'approved'). */
  status: SignalStatus;
  /** Joined store name for display; null for non-merchant signals. */
  storeName: string | null;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface SignalInput {
  merchantId: string | null;
  title: string;
  summary: string;
  votesSample: number | null;
  commentCount: number | null;
  sentiment: Sentiment;
  dealKind: DealKind;
  sourceUrl: string;
  merchantUrl: string | null;
  productUrl: string | null;
  postedAt: string | null;
  expiryDate: string | null;
  tags: string[];
  promoCode: string | null;
  priceText: string | null;
  signalScore: number | null;
  confidence: Confidence;
  isSample: boolean;
  status: SignalStatus;
  productGroup: string | null;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface AdminSignalRow {
  id: string;
  source_native_id: string | null;
  merchant_id: string | null;
  title: string;
  summary: string;
  votes_sample: number | null;
  comment_count: number | null;
  sentiment: Sentiment;
  deal_kind: DealKind;
  source_url: string;
  merchant_url: string | null;
  product_url: string | null;
  posted_at: string | null;
  expiry_date: string | null;
  tags: string[] | null;
  promo_code: string | null;
  price_text: string | null;
  signal_score: number | string | null;
  confidence: Confidence;
  last_checked_at: string;
  is_sample: boolean;
  status: SignalStatus;
  product_group: string | null;
  updated_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapAdminSignal(r: AdminSignalRow): AdminSignal {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
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
    productGroup: r.product_group ?? null,
    storeName: store?.name ?? null,
    updatedAt: r.updated_at,
  };
}

/** Snake-case row payload for insert/update. */
function toRow(input: SignalInput) {
  return {
    merchant_id: input.merchantId,
    title: input.title,
    summary: input.summary,
    votes_sample: input.votesSample,
    comment_count: input.commentCount,
    sentiment: input.sentiment,
    deal_kind: input.dealKind,
    source_url: input.sourceUrl,
    merchant_url: input.merchantUrl,
    product_url: input.productUrl,
    posted_at: input.postedAt,
    expiry_date: input.expiryDate,
    tags: input.tags,
    promo_code: input.promoCode,
    price_text: input.priceText,
    signal_score: input.signalScore,
    confidence: input.confidence,
    is_sample: input.isSample,
    status: input.status,
    product_group: input.productGroup,
    // The admin is hand-verifying the data on every save, so stamp it now.
    last_checked_at: new Date().toISOString(),
  };
}

/** Lowercase, hyphenated, alnum-only slug for a readable PK segment. */
function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "signal"
  );
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every signal — pending, approved, hidden, expired — newest-edited first. */
export async function listSignals(): Promise<AdminSignal[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ozbargain_signals")
    .select(SELECT_WITH_STORE)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listSignals failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminSignalRow[]).map(mapAdminSignal);
}

/** A single signal by id, or null when it does not exist. */
export async function getSignal(id: string): Promise<AdminSignal | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("ozbargain_signals")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getSignal failed: ${error.message}`);
  if (!data) return null;
  return mapAdminSignal(data as unknown as AdminSignalRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new signal and returns its generated id. */
export async function insertSignal(input: SignalInput): Promise<string> {
  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: sig-<title>-<short uuid>.
  const id = `sig-${slugify(input.title)}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("ozbargain_signals")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertSignal failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing signal. */
export async function updateSignal(
  id: string,
  input: SignalInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("ozbargain_signals")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateSignal failed: ${error.message}`);
}

/** Flips just the moderation status (approve / hide / etc. from the list view). */
export async function setSignalStatus(
  id: string,
  status: SignalStatus
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("ozbargain_signals")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(`setSignalStatus failed: ${error.message}`);
}
