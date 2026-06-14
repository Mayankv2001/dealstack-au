import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumber, toNumberOrNull } from "@/lib/supabase/server";
import type { CashbackOffer } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Admin-side cashback repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * panel read unpublished drafts and write rows that the public anon client (see
 * lib/repos/offers.ts) can never touch. Because of that, this module must only
 * ever be imported by server code that runs behind requireAdmin() — never from a
 * client component. The browser guard inside getSupabaseAdmin() is the backstop.
 *
 * Cashback providers are intentionally limited to ShopBack and TopCashback. The
 * DB CHECK constraint enforces it too; Cashrewards is never permitted. No
 * scraping / agents / external source calls live here — it talks only to our own
 * Supabase project.
 */

/** The only cashback providers we ever store (matches the DB CHECK constraint). */
export const CASHBACK_PROVIDERS = ["ShopBack", "TopCashback"] as const;
export type CashbackProvider = (typeof CASHBACK_PROVIDERS)[number];

/** Confidence levels shared with the rest of the offer model. */
export const CONFIDENCE_LEVELS: Confidence[] = [
  "confirmed",
  "needs-verification",
  "expired-unknown",
];

/** A store for the merchant dropdown. */
export interface StoreOption {
  id: string;
  name: string;
}

/** A cashback offer as the admin sees it — domain shape plus admin-only fields. */
export interface AdminCashbackOffer extends CashbackOffer {
  /** Drafts (false) are invisible on /deals but still listed in the admin. */
  isPublished: boolean;
  /** Joined store name for display; null if the store row went missing. */
  storeName: string | null;
  updatedAt: string;
}

/** Validated, normalised values ready to be written to the DB. */
export interface CashbackOfferInput {
  merchantId: string;
  provider: CashbackProvider;
  ratePercent: number;
  flatAmount: number | null;
  capDollars: number | null;
  isUpsized: boolean;
  excludesGiftCardPayment: boolean;
  termsSummary: string;
  expiryDate: string | null;
  confidence: Confidence;
  citations: Citation[];
  isPublished: boolean;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface AdminCashbackRow {
  id: string;
  merchant_id: string;
  provider: CashbackProvider;
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
  is_published: boolean;
  updated_at: string;
  // Embedded one-to-one store (PostgREST returns an object, but type defensively).
  store: { name: string } | { name: string }[] | null;
}

function mapAdminCashback(r: AdminCashbackRow): AdminCashbackOffer {
  const store = Array.isArray(r.store) ? r.store[0] : r.store;
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
    isPublished: r.is_published,
    storeName: store?.name ?? null,
    updatedAt: r.updated_at,
  };
}

/** Snake-case row payload for insert/update. */
function toRow(input: CashbackOfferInput) {
  return {
    merchant_id: input.merchantId,
    provider: input.provider,
    rate_percent: input.ratePercent,
    flat_amount: input.flatAmount,
    cap_dollars: input.capDollars,
    is_upsized: input.isUpsized,
    excludes_gift_card_payment: input.excludesGiftCardPayment,
    terms_summary: input.termsSummary,
    expiry_date: input.expiryDate,
    citations: input.citations,
    confidence: input.confidence,
    is_published: input.isPublished,
    // The admin is hand-verifying the data on every save, so stamp it now.
    last_checked_at: new Date().toISOString(),
  };
}

const SELECT_WITH_STORE = "*, store:stores(name)";

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every cashback offer, published or not, newest-edited first. */
export async function listCashbackOffers(): Promise<AdminCashbackOffer[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cashback_offers")
    .select(SELECT_WITH_STORE)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listCashbackOffers failed: ${error.message}`);
  return ((data ?? []) as unknown as AdminCashbackRow[]).map(mapAdminCashback);
}

/** A single offer by id, or null when it does not exist. */
export async function getCashbackOffer(
  id: string
): Promise<AdminCashbackOffer | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cashback_offers")
    .select(SELECT_WITH_STORE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getCashbackOffer failed: ${error.message}`);
  if (!data) return null;
  return mapAdminCashback(data as unknown as AdminCashbackRow);
}

/** All stores (including unpublished) for the merchant dropdown, A→Z. */
export async function listStoreOptions(): Promise<StoreOption[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("stores")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(`listStoreOptions failed: ${error.message}`);
  return (data ?? []) as unknown as StoreOption[];
}

// ── Writes ───────────────────────────────────────────────────────────────────

/** Inserts a new offer and returns its generated id. */
export async function insertCashbackOffer(
  input: CashbackOfferInput
): Promise<string> {
  const db = getSupabaseAdmin();
  // Readable, collision-proof text PK: cb-<provider>-<merchant>-<short uuid>.
  const id = `cb-${input.provider.toLowerCase()}-${input.merchantId}-${randomUUID().slice(0, 8)}`;
  const { error } = await db
    .from("cashback_offers")
    .insert({ id, ...toRow(input) });
  if (error) throw new Error(`insertCashbackOffer failed: ${error.message}`);
  return id;
}

/** Updates every editable field of an existing offer. */
export async function updateCashbackOffer(
  id: string,
  input: CashbackOfferInput
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("cashback_offers")
    .update(toRow(input))
    .eq("id", id);
  if (error) throw new Error(`updateCashbackOffer failed: ${error.message}`);
}

/** Flips just the published flag (publish / unpublish from the list view). */
export async function setCashbackPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("cashback_offers")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setCashbackPublished failed: ${error.message}`);
}
