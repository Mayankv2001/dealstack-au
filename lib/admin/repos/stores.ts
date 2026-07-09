import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toNumber } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import type { CashbackProvider, StoreLogoTheme } from "@/lib/data";

/**
 * Admin-side stores repository — SERVICE-ROLE ONLY.
 *
 * Every function here talks to Supabase through getSupabaseAdmin(), which uses
 * the service-role key and therefore BYPASSES RLS. That is what lets the admin
 * panel read unpublished stores and write rows the public anon client can never
 * touch. Because of that, this module must only ever be imported by server code
 * that runs behind requireAdmin() — never from a client component.
 *
 * Manual entry only: no scraping / fetching / agents / external source calls
 * live here — it talks only to our own Supabase project.
 *
 * Two deliberate deviations from the card-offers clone this mirrors:
 *   1. The store id is admin-supplied (it is the public /stores/[id] slug and
 *      the join key offers reference via merchant_id / accepted_at_merchant_ids),
 *      NOT generated. It is immutable after creation — updateStore() never writes
 *      it (toRow omits it), so a rename can never orphan referencing rows.
 *   2. There is NO delete. Unpublish is the whole lifecycle (setStorePublished).
 * `stores` also has no last_checked_at column, so — unlike cardOffers — nothing
 * is stamped on save.
 */

export const CASHBACK_PROVIDERS: CashbackProvider[] = [
  "ShopBack",
  "TopCashback",
  "—",
];

/** Admin-supplied store ids: lowercase slug, matches the public /stores/[id]. */
export const STORE_ID_PATTERN = /^[a-z0-9-]{2,40}$/;

/** Thrown when an insert collides with an existing primary key. */
export class StoreIdConflictError extends Error {
  constructor(id: string) {
    super(`A store with the id "${id}" already exists.`);
    this.name = "StoreIdConflictError";
  }
}

/** A store as the admin sees it (published or not). */
export interface AdminStore {
  id: string;
  name: string;
  category: string;
  logo: string;
  logoPath: string | null;
  logoText: string | null;
  logoSubtext: string | null;
  logoTheme: StoreLogoTheme | null;
  discountPercent: number;
  discountCode: string;
  expiryDate: string | null;
  cashbackPercent: number;
  cashbackProvider: CashbackProvider;
  giftCardDiscountPercent: number;
  giftCardSource: string;
  pointsProgram: string;
  pointsRate: string;
  aliases: string[];
  isPublished: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validated, normalised values ready to be written to the DB. Note: `id` is NOT
 * here — it is passed separately to insertStore() and is never part of an update
 * payload, which is how immutability is enforced structurally.
 */
export interface StoreInput {
  name: string;
  category: string;
  logo: string;
  logoPath: string | null;
  logoText: string | null;
  logoSubtext: string | null;
  logoTheme: StoreLogoTheme | null;
  discountPercent: number;
  discountCode: string;
  expiryDate: string | null;
  cashbackPercent: number;
  cashbackProvider: CashbackProvider;
  giftCardDiscountPercent: number;
  giftCardSource: string;
  pointsProgram: string;
  pointsRate: string;
  aliases: string[];
  isPublished: boolean;
  sortOrder: number;
}

// ── Row mapping ──────────────────────────────────────────────────────────────
interface StoreRow {
  id: string;
  name: string;
  category: string;
  logo: string;
  logo_path: string | null;
  logo_text: string | null;
  logo_subtext: string | null;
  logo_theme: StoreLogoTheme | null;
  discount_percent: number | string;
  discount_code: string;
  expiry_date: string | null;
  cashback_percent: number | string;
  cashback_provider: CashbackProvider;
  gift_card_discount_percent: number | string;
  gift_card_source: string;
  points_program: string;
  points_rate: string;
  aliases: string[] | null;
  is_published: boolean;
  sort_order: number | string;
  created_at: string;
  updated_at: string;
}

function mapAdminStore(r: StoreRow): AdminStore {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    logo: r.logo,
    logoPath: r.logo_path,
    logoText: r.logo_text,
    logoSubtext: r.logo_subtext,
    logoTheme: r.logo_theme,
    // numeric columns arrive back from Postgres as strings.
    discountPercent: toNumber(r.discount_percent),
    discountCode: r.discount_code,
    expiryDate: r.expiry_date,
    cashbackPercent: toNumber(r.cashback_percent),
    cashbackProvider: r.cashback_provider,
    giftCardDiscountPercent: toNumber(r.gift_card_discount_percent),
    giftCardSource: r.gift_card_source,
    pointsProgram: r.points_program,
    pointsRate: r.points_rate,
    aliases: r.aliases ?? [],
    isPublished: r.is_published,
    sortOrder: toNumber(r.sort_order),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Snake-case row payload for insert/update. Deliberately omits `id` — the id is
 * immutable, supplied once at insert time and never included in an update, so a
 * rename can never silently orphan referencing offers/signals.
 */
function toRow(input: StoreInput) {
  return {
    name: input.name,
    category: input.category,
    logo: input.logo,
    logo_path: input.logoPath,
    logo_text: input.logoText,
    logo_subtext: input.logoSubtext,
    logo_theme: input.logoTheme as Json | null,
    discount_percent: input.discountPercent,
    discount_code: input.discountCode,
    expiry_date: input.expiryDate,
    cashback_percent: input.cashbackPercent,
    cashback_provider: input.cashbackProvider,
    gift_card_discount_percent: input.giftCardDiscountPercent,
    gift_card_source: input.giftCardSource,
    points_program: input.pointsProgram,
    points_rate: input.pointsRate,
    aliases: input.aliases,
    is_published: input.isPublished,
    sort_order: input.sortOrder,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Every store, published or not, in the public display order (sort_order, name). */
export async function listStores(): Promise<AdminStore[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("stores")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`listStores failed: ${error.message}`);
  return ((data ?? []) as unknown as StoreRow[]).map(mapAdminStore);
}

/** A single store by id, or null when it does not exist. */
export async function getStore(id: string): Promise<AdminStore | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("stores")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getStore failed: ${error.message}`);
  if (!data) return null;
  return mapAdminStore(data as unknown as StoreRow);
}

// ── Writes ───────────────────────────────────────────────────────────────────

/**
 * Inserts a new store under the admin-supplied id. A duplicate primary key
 * (Postgres 23505) surfaces as a friendly {@link StoreIdConflictError} so the
 * action can show "already exists" instead of a 500.
 */
export async function insertStore(id: string, input: StoreInput): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("stores").insert({ id, ...toRow(input) });
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new StoreIdConflictError(id);
    }
    throw new Error(`insertStore failed: ${error.message}`);
  }
}

/**
 * Updates every editable field of an existing store. The id is never part of the
 * payload (toRow omits it), so it stays immutable no matter what the form sends.
 */
export async function updateStore(id: string, input: StoreInput): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("stores").update(toRow(input)).eq("id", id);
  if (error) throw new Error(`updateStore failed: ${error.message}`);
}

/** Flips just the published flag (publish / unpublish from the list view). */
export async function setStorePublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ is_published: isPublished })
    .eq("id", id);
  if (error) throw new Error(`setStorePublished failed: ${error.message}`);
}
