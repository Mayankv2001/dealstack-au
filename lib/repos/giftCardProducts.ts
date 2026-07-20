import type {
  GiftCardAcceptanceRow,
  GiftCardProduct,
} from "@/lib/offers/types";
import { gcdbFixtureGiftCardProducts } from "@/lib/offers/gcdbFixtureOffers";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { fromDbOrDemo, toNumberOrNull } from "@/lib/supabase/server";

/**
 * Public gift-card product / merchant-acceptance reads.
 *
 * Both tables are default-deny with narrow public policies (021): only rows an
 * admin explicitly activated (`gift_card_products.is_active`) or published
 * (`gift_card_merchant_acceptance.is_public`) are visible to the anon client —
 * RLS enforces it, these queries just add the matching filter for clarity.
 * Acceptance rows have deliberately NO demo fallback: absent data renders the
 * honest "not recorded" states on the detail page. Products carry a demo
 * fallback of the explicitly test-only GCDB fixture catalogue
 * (lib/offers/gcdbFixtureOffers.ts) so demo mode can exercise the
 * per-denomination worked-example surfaces; a configured database never sees
 * that array.
 */

const NETWORKS = ["visa", "mastercard", "eftpos", "closed-loop", "unknown"] as const;
const FORMATS = ["digital", "physical", "digital-and-physical", "unknown"] as const;
const WALLETS = ["supported", "unsupported", "partial", "unknown"] as const;
const SPLIT_PAYMENTS = ["supported", "unsupported", "partial", "unknown"] as const;
const ACCEPTANCE_STATUSES = ["verified", "claimed", "community"] as const;
const CANONICAL_ACCEPTANCE_STATUSES = [
  "confirmed-accepted",
  "confirmed-not-accepted",
  "likely-accepted",
  "unofficially-reported",
  "requires-verification",
  "stale",
  "unknown",
] as const;
const ACCEPTANCE_EVIDENCE_TYPES = [
  "issuer-official",
  "merchant-official",
  "terms",
  "card-network-mcc",
  "gcdb",
  "specialist",
  "community",
] as const;

type Network = (typeof NETWORKS)[number];
type Format = (typeof FORMATS)[number];
type Wallet = (typeof WALLETS)[number];
type SplitPayment = (typeof SPLIT_PAYMENTS)[number];
type AcceptanceStatus = (typeof ACCEPTANCE_STATUSES)[number];
type CanonicalAcceptanceStatus = (typeof CANONICAL_ACCEPTANCE_STATUSES)[number];
type AcceptanceEvidenceType = (typeof ACCEPTANCE_EVIDENCE_TYPES)[number];

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T => (allowed.includes(value as T) ? (value as T) : fallback);

const intList = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.map(Number).filter((n) => Number.isInteger(n) && n > 0)
    : [];

const strList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((v) => String(v).trim()).filter(Boolean)
    : [];

/** Positive numeric denominations. Returns null when the column is unset
 * (unknown), [] only when the source explicitly stored an empty array. */
const denomList = (value: unknown): number[] | null =>
  Array.isArray(value)
    ? value.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    : null;

const boolOrNull = (value: unknown): boolean | null =>
  value === true || value === false ? value : null;

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
  // Migration 028 fields are optional so current production rows (where 028 is
  // intentionally unapplied) map to explicit unknowns rather than throwing.
  aliases?: unknown;
  official_product_page?: unknown;
  activation_method?: unknown;
  online_available?: unknown;
  in_store_available?: unknown;
  denominations?: unknown;
  activation_delay_note?: unknown;
  split_payment?: unknown;
  expiry_or_fees_note?: unknown;
  // Migration 034 jsonb; tolerant of databases where 034 is not yet applied.
  purchase_fees?: unknown;
}

/** { "100": 5.95 } purchase-fee map; null when the column is unset/unknown. */
const feeMap = (value: unknown): Record<string, number> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const entries = Object.entries(value as Record<string, unknown>).flatMap(
    ([denomination, fee]) => {
      const denom = Number(denomination);
      const dollars = Number(fee);
      return Number.isFinite(denom) && denom > 0 && Number.isFinite(dollars) && dollars >= 0
        ? [[String(denom), dollars] as const]
        : [];
    },
  );
  return Object.fromEntries(entries);
};

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
  acceptance_status?: unknown;
  evidence_source_type?: unknown;
  evidence_publisher?: unknown;
  evidence_url?: unknown;
  evidence_captured_at?: unknown;
  last_checked_at?: unknown;
  accepts_online?: unknown;
  accepts_in_store?: unknown;
  accepts_app?: unknown;
  accepts_phone?: unknown;
  valid_from?: unknown;
  valid_until?: unknown;
  limitations?: unknown;
  region?: unknown;
  participating_location_required?: unknown;
  review_state?: unknown;
}

function legacyAcceptanceStatus(r: AcceptanceDbRow): CanonicalAcceptanceStatus {
  if (r.outcome === "unsuccessful") return "confirmed-not-accepted";
  if (r.status === "verified") return "confirmed-accepted";
  if (r.status === "claimed") return "likely-accepted";
  if (r.status === "community") return "unofficially-reported";
  return "unknown";
}

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

/** Maps current and pre-028 product rows into the public null-safe boundary. */
export function mapGiftCardProduct(r: ProductRow): GiftCardProduct {
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
    aliases: strList(r.aliases),
    officialProductPage:
      typeof r.official_product_page === "string"
        ? safeHttpsUrl(r.official_product_page)
        : null,
    activationMethod:
      typeof r.activation_method === "string" && r.activation_method.trim()
        ? r.activation_method.trim()
        : null,
    onlineAvailable: boolOrNull(r.online_available),
    inStoreAvailable: boolOrNull(r.in_store_available),
    denominations: denomList(r.denominations),
    activationDelayNote:
      typeof r.activation_delay_note === "string" && r.activation_delay_note.trim()
        ? r.activation_delay_note.trim()
        : null,
    splitPayment: oneOf<SplitPayment>(r.split_payment, SPLIT_PAYMENTS, "unknown"),
    expiryOrFeesNote:
      typeof r.expiry_or_fees_note === "string" && r.expiry_or_fees_note.trim()
        ? r.expiry_or_fees_note.trim()
        : null,
    purchaseFees: feeMap(r.purchase_fees),
  };
}

export function mapGiftCardAcceptance(r: AcceptanceDbRow): GiftCardAcceptanceRow {
  const canonical = oneOf<CanonicalAcceptanceStatus>(
    r.acceptance_status,
    CANONICAL_ACCEPTANCE_STATUSES,
    legacyAcceptanceStatus(r),
  );
  const evidenceSourceType = ACCEPTANCE_EVIDENCE_TYPES.includes(
    r.evidence_source_type as AcceptanceEvidenceType,
  )
    ? (r.evidence_source_type as AcceptanceEvidenceType)
    : null;
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
    acceptanceStatus: canonical,
    evidenceSourceType,
    evidencePublisher: stringOrNull(r.evidence_publisher),
    evidenceUrl:
      typeof r.evidence_url === "string" ? safeHttpsUrl(r.evidence_url) : null,
    evidenceCapturedAt: stringOrNull(r.evidence_captured_at),
    lastCheckedAt: stringOrNull(r.last_checked_at) ?? r.checked_at,
    acceptsOnline: boolOrNull(r.accepts_online),
    acceptsInStore: boolOrNull(r.accepts_in_store),
    acceptsApp: boolOrNull(r.accepts_app),
    acceptsPhone: boolOrNull(r.accepts_phone),
    validFrom: stringOrNull(r.valid_from),
    validUntil: stringOrNull(r.valid_until),
    limitations: stringOrNull(r.limitations),
    region: stringOrNull(r.region) ?? "AU",
    participatingLocationRequired: boolOrNull(
      r.participating_location_required,
    ),
  };
}

/**
 * Before 028 the column does not exist; after 028 only canonical RPC-approved
 * rows are public. A present null/unrecognised value therefore fails closed.
 */
export function isReviewedPublicAcceptanceRow(r: AcceptanceDbRow): boolean {
  return r.review_state === undefined || r.review_state === "approved";
}

/** Active products for the given ids ([] in demo mode or when none are active). */
export async function getGiftCardProducts(
  ids: string[]
): Promise<GiftCardProduct[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  const demoProducts = gcdbFixtureGiftCardProducts.filter((product) =>
    wanted.includes(product.id),
  );
  return fromDbOrDemo("gift_card_products", demoProducts, async (db) => {
    const { data, error } = await db
      .from("gift_card_products")
      .select("*")
      .in("id", wanted)
      .eq("is_active", true);
    if (error) throw error;
    return ((data ?? []) as unknown as ProductRow[]).map(mapGiftCardProduct);
  });
}

/** All admin-activated products for the public directory. */
export async function getAllGiftCardProducts(): Promise<GiftCardProduct[]> {
  return fromDbOrDemo("gift_card_products", gcdbFixtureGiftCardProducts, async (db) => {
    const { data, error } = await db
      .from("gift_card_products")
      .select("*")
      .eq("is_active", true)
      .order("brand", { ascending: true })
      .limit(1000);
    if (error) throw error;
    return ((data ?? []) as unknown as ProductRow[]).map(mapGiftCardProduct);
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
      return ((data ?? []) as unknown as AcceptanceDbRow[])
        .filter(isReviewedPublicAcceptanceRow)
        .map(mapGiftCardAcceptance);
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
      return ((data ?? []) as unknown as AcceptanceDbRow[])
        .filter(isReviewedPublicAcceptanceRow)
        .map(mapGiftCardAcceptance);
    }
  );
}
