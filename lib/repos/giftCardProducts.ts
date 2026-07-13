import type {
  GiftCardAcceptanceRow,
  GiftCardProduct,
} from "@/lib/offers/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { fromDbOrDemo, toNumberOrNull } from "@/lib/supabase/server";

/**
 * Public gift-card product / merchant-acceptance reads.
 *
 * Both tables are default-deny with narrow public policies (021): only rows an
 * admin explicitly activated (`gift_card_products.is_active`) or published
 * (`gift_card_merchant_acceptance.is_public`) are visible to the anon client —
 * RLS enforces it, these queries just add the matching filter for clarity.
 * There is deliberately NO demo fallback: absent data renders the honest
 * "not recorded" states on the detail page.
 */

const NETWORKS = ["visa", "mastercard", "eftpos", "closed-loop", "unknown"] as const;
const FORMATS = ["digital", "physical", "digital-and-physical", "unknown"] as const;
const WALLETS = ["supported", "unsupported", "partial", "unknown"] as const;
const ACCEPTANCE_STATUSES = ["verified", "claimed", "community"] as const;

type Network = (typeof NETWORKS)[number];
type Format = (typeof FORMATS)[number];
type Wallet = (typeof WALLETS)[number];
type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => (allowed.includes(value as T) ? (value as T) : fallback);

const intList = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

interface ProductRow {
  id: string;
  brand: string;
  slug: string;
  issuer: string | null;
  card_network: string | null;
  format: string;
  variable_load: boolean | null;
  min_denomination: number | string | null;
  max_denomination: number | string | null;
  category_restricted: boolean;
  supported_mccs: number[] | null;
  unsupported_mccs: number[] | null; // migration 022 (applied to production 2026-07-12)
  mobile_wallet: string;
  redemption_notes: string | null;
}

interface AcceptanceDbRow {
  id: string;
  product_id: string;
  store_id: string | null;
  merchant_name: string | null;
  merchant_category: string | null;
  mcc: number | null;
  status: string;
  outcome: string | null;
  source_url: string | null;
  checked_at: string | null;
  notes: string | null;
}

function mapProduct(r: ProductRow): GiftCardProduct {
  return {
    id: r.id,
    brand: r.brand,
    slug: r.slug,
    issuer: r.issuer,
    cardNetwork: r.card_network
      ? oneOf<Network>(r.card_network, NETWORKS, "unknown")
      : null,
    format: oneOf<Format>(r.format, FORMATS, "unknown"),
    variableLoad: r.variable_load,
    minDenomination: toNumberOrNull(r.min_denomination),
    maxDenomination: toNumberOrNull(r.max_denomination),
    categoryRestricted: r.category_restricted === true,
    supportedMccs: intList(r.supported_mccs),
    unsupportedMccs: intList(r.unsupported_mccs),
    mobileWallet: oneOf<Wallet>(r.mobile_wallet, WALLETS, "unknown"),
    redemptionNotes: r.redemption_notes,
  };
}

function mapAcceptance(r: AcceptanceDbRow): GiftCardAcceptanceRow {
  return {
    id: r.id,
    productId: r.product_id,
    storeId: r.store_id,
    merchantName: r.merchant_name,
    merchantCategory: r.merchant_category,
    mcc: r.mcc,
    status: oneOf<AcceptanceStatus>(r.status, ACCEPTANCE_STATUSES, "community"),
    outcome:
      r.outcome === "successful" || r.outcome === "unsuccessful"
        ? r.outcome
        : null,
    sourceUrl: r.source_url ? (safeHttpsUrl(r.source_url) ?? null) : null,
    checkedAt: r.checked_at,
    notes: r.notes,
  };
}

/** Active products for the given ids ([] in demo mode or when none are active). */
export async function getGiftCardProducts(
  ids: string[]
): Promise<GiftCardProduct[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  return fromDbOrDemo("gift_card_products", [] as GiftCardProduct[], async (db) => {
    const { data, error } = await db
      .from("gift_card_products")
      .select("*")
      .in("id", wanted)
      .eq("is_active", true);
    if (error) throw error;
    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  });
}

/** All admin-activated products for the public directory. */
export async function getAllGiftCardProducts(): Promise<GiftCardProduct[]> {
  return fromDbOrDemo("gift_card_products", [] as GiftCardProduct[], async (db) => {
    const { data, error } = await db
      .from("gift_card_products")
      .select("*")
      .eq("is_active", true)
      .order("brand", { ascending: true })
      .limit(1000);
    if (error) throw error;
    return ((data ?? []) as unknown as ProductRow[]).map(mapProduct);
  });
}

/** Published acceptance rows for the given products, verified-first. */
export async function getGiftCardAcceptance(
  productIds: string[]
): Promise<GiftCardAcceptanceRow[]> {
  const wanted = [...new Set(productIds.filter(Boolean))];
  if (wanted.length === 0) return [];
  return fromDbOrDemo(
    "gift_card_merchant_acceptance",
    [] as GiftCardAcceptanceRow[],
    async (db) => {
      const { data, error } = await db
        .from("gift_card_merchant_acceptance")
        .select("*")
        .in("product_id", wanted)
        .eq("is_public", true)
        .limit(500);
      if (error) throw error;
      return ((data ?? []) as unknown as AcceptanceDbRow[]).map(mapAcceptance);
    }
  );
}


/** Every admin-published acceptance fact for the bidirectional lookup. */
export async function getAllGiftCardAcceptance(): Promise<GiftCardAcceptanceRow[]> {
  return fromDbOrDemo(
    "gift_card_merchant_acceptance",
    [] as GiftCardAcceptanceRow[],
    async (db) => {
      const { data, error } = await db
        .from("gift_card_merchant_acceptance")
        .select("*")
        .eq("is_public", true)
        .limit(2000);
      if (error) throw error;
      return ((data ?? []) as unknown as AcceptanceDbRow[]).map(mapAcceptance);
    }
  );
}
