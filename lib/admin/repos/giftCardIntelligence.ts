import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { buildOfferOccurrenceSnapshot, type ExpiredGiftCardOfferForHistory } from "@/lib/giftcards/offerOccurrenceSnapshot";

type UntypedTable = "stores";
const table = (name: string) => getSupabaseAdmin().from(name as UntypedTable);

export interface IntelligenceProgrammeRow {
  id: string;
  provider: string;
  name: string;
  membership_required: boolean;
  account_required: boolean;
  review_by_date: string;
  confidence: string;
  is_published: boolean;
  source_url: string;
  programme_kind: string;
  account_requirement: string | null;
  payment_requirement: string | null;
  terms_url: string | null;
  is_ongoing: boolean;
}

export interface IntelligenceRateRow {
  id: string;
  programme_id: string;
  brand_name: string;
  promotion_type: string;
  review_by_date: string;
  confidence: string;
  is_active: boolean;
  is_published: boolean;
  discount_percent: number | null;
  fixed_discount_dollars: number | null;
  bonus_percent: number | null;
  fee_waiver_dollars: number | null;
  threshold_dollars: number | null;
  membership_tier: string | null;
  payment_requirement: string | null;
  source_url: string;
  is_ongoing: boolean;
}

export interface PublicCorrectionRow {
  id: string;
  entity_type: string;
  entity_id: string;
  reported_label: string;
  reason: string;
  details: string;
  status: "new" | "reviewed" | "dismissed";
  created_at: string;
}

export interface HistoryCandidate {
  id: string;
  brand: string;
  seller: string | null;
  promotionType: string;
  expiryDate: string;
}

export interface IntelligenceProductRow {
  id: string;
  brand: string;
  slug: string;
  issuer: string | null;
  is_active: boolean;
  aliases?: string[];
  official_product_page?: string | null;
  activation_method?: string | null;
  online_available?: boolean | null;
  in_store_available?: boolean | null;
  denominations?: number[] | null;
  activation_delay_note?: string | null;
  split_payment?: string;
  expiry_or_fees_note?: string | null;
}

export interface IntelligenceAcceptanceRow {
  id: string;
  product_id: string;
  merchant_name: string | null;
  merchant_category: string | null;
  status: string;
  outcome: string | null;
  checked_at: string | null;
  is_public: boolean;
}

export interface IntelligenceRateHistoryRow {
  id: string;
  programme_rate_id: string;
  change_kind: string;
  changed_fields: string[];
  checked_at: string;
  actor_email: string | null;
}

export interface GiftCardIntelligenceAdminData {
  schemaAvailable: boolean;
  productCatalogueAvailable: boolean;
  programmes: IntelligenceProgrammeRow[];
  rates: IntelligenceRateRow[];
  corrections: PublicCorrectionRow[];
  historyCandidates: HistoryCandidate[];
  products: IntelligenceProductRow[];
  acceptance: IntelligenceAcceptanceRow[];
  rateHistory: IntelligenceRateHistoryRow[];
}

async function optionalRows<T>(name: string): Promise<{ available: boolean; rows: T[] }> {
  const { data, error } = await table(name).select("*").order("created_at", { ascending: false });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { available: false, rows: [] };
    throw new Error(`list ${name} failed: ${error.message}`);
  }
  return { available: true, rows: (data ?? []) as unknown as T[] };
}

export async function isProductCatalogueSchemaAvailable(): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("gift_card_products")
    .select("aliases")
    .limit(1);
  if (!error) return true;
  if (error.code === "42703" || error.code === "PGRST204" || error.code === "PGRST205") {
    return false;
  }
  throw new Error(`check gift-card product catalogue schema failed: ${error.message}`);
}

export async function getGiftCardIntelligenceAdminData(today: string): Promise<GiftCardIntelligenceAdminData> {
  const [programmes, rates, rateHistory, corrections, offers, occurrences, products, acceptance, catalogueAvailable] = await Promise.all([
    optionalRows<IntelligenceProgrammeRow>("gift_card_programmes"),
    optionalRows<IntelligenceRateRow>("gift_card_programme_rates"),
    optionalRows<IntelligenceRateHistoryRow>("gift_card_programme_rate_history"),
    optionalRows<PublicCorrectionRow>("public_correction_reports"),
    getSupabaseAdmin().from("gift_card_offers").select("id, brand, purchase_location, promotion_type, expiry_date").lt("expiry_date", today).order("expiry_date", { ascending: false }),
    optionalRows<{ source_offer_id: string | null }>("gift_card_offer_occurrences"),
    getSupabaseAdmin().from("gift_card_products").select("*").order("brand"),
    getSupabaseAdmin().from("gift_card_merchant_acceptance").select("id, product_id, merchant_name, merchant_category, status, outcome, checked_at, is_public").order("created_at", { ascending: false }).limit(500),
    isProductCatalogueSchemaAvailable(),
  ]);
  if (offers.error) throw new Error(`list history candidates failed: ${offers.error.message}`);
  if (products.error) throw new Error(`list products failed: ${products.error.message}`);
  if (acceptance.error) throw new Error(`list acceptance failed: ${acceptance.error.message}`);
  const sealed = new Set(occurrences.rows.map((row) => row.source_offer_id).filter(Boolean));
  const historyCandidates = (offers.data ?? []).filter((row) => row.expiry_date && !sealed.has(row.id)).map((row) => ({ id: row.id, brand: row.brand, seller: row.purchase_location, promotionType: row.promotion_type, expiryDate: row.expiry_date! }));
  return {
    schemaAvailable: programmes.available && rates.available && rateHistory.available && corrections.available && occurrences.available,
    productCatalogueAvailable: catalogueAvailable,
    programmes: programmes.rows,
    rates: rates.rows,
    rateHistory: rateHistory.rows,
    corrections: corrections.rows,
    historyCandidates,
    products: (products.data ?? []) as IntelligenceProductRow[],
    acceptance: (acceptance.data ?? []) as IntelligenceAcceptanceRow[],
  };
}

export async function insertGiftCardProduct(input: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseAdmin().from("gift_card_products").insert(input as never);
  if (error) throw new Error(error.message);
}

export async function updateGiftCardProduct(id: string, input: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("gift_card_products")
    .update(input as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getGiftCardProductSourceEvidence(id: string): Promise<unknown[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("gift_card_products")
    .select("source_evidence")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return Array.isArray(data.source_evidence) ? data.source_evidence : [];
}

export async function insertGiftCardAcceptance(input: Record<string, unknown>): Promise<void> {
  const { error } = await getSupabaseAdmin().from("gift_card_merchant_acceptance").insert(input as never);
  if (error) throw new Error(error.message);
}

export async function setGiftCardFactPublished(kind: "product" | "acceptance", id: string, published: boolean): Promise<void> {
  if (published) {
    if (kind === "product") {
      const check = await getSupabaseAdmin().from("gift_card_products").select("brand, source_evidence").eq("id", id).single();
      if (check.error) throw new Error(check.error.message);
      if (!check.data.brand.trim() || !Array.isArray(check.data.source_evidence) || check.data.source_evidence.length === 0) throw new Error("Product needs reviewed source evidence before activation.");
    } else {
      const check = await getSupabaseAdmin().from("gift_card_merchant_acceptance").select("merchant_name, merchant_category, source_url, checked_at, status, outcome").eq("id", id).single();
      if (check.error) throw new Error(check.error.message);
      if ((!check.data.merchant_name && !check.data.merchant_category) || !check.data.source_url || !check.data.checked_at || !["verified", "claimed", "community"].includes(check.data.status) || !["successful", "unsuccessful"].includes(check.data.outcome ?? "")) throw new Error("Acceptance needs a merchant, evidence URL, checked date, status and outcome before publication.");
    }
  }
  const query = kind === "product"
    ? getSupabaseAdmin().from("gift_card_products").update({ is_active: published }).eq("id", id)
    : getSupabaseAdmin().from("gift_card_merchant_acceptance").update({ is_public: published }).eq("id", id);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function insertProgramme(input: Record<string, unknown>): Promise<void> {
  const { error } = await table("gift_card_programmes").insert(input as never);
  if (error) throw new Error(error.message);
}

export async function insertProgrammeRate(input: Record<string, unknown>): Promise<void> {
  const { error } = await table("gift_card_programme_rates").insert(input as never);
  if (error) throw new Error(error.message);
}

export async function updateProgrammeRecord(id: string, input: Record<string, unknown>): Promise<void> {
  const { error } = await table("gift_card_programmes").update(input as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateProgrammeRateRecord(id: string, input: Record<string, unknown>): Promise<void> {
  const { error } = await table("gift_card_programme_rates").update(input as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveIntelligenceRecord(kind: "programme" | "rate", id: string): Promise<void> {
  const values = kind === "programme" ? { is_ongoing: false, is_published: false } : { is_active: false, is_ongoing: false, is_published: false, valid_to: new Date().toISOString().slice(0, 10) };
  const { error } = await table(kind === "programme" ? "gift_card_programmes" : "gift_card_programme_rates").update(values as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setIntelligencePublished(kind: "programme" | "rate", id: string, published: boolean): Promise<void> {
  const { error } = await table(kind === "programme" ? "gift_card_programmes" : "gift_card_programme_rates").update({ is_published: published } as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setPublicCorrectionStatus(id: string, status: "reviewed" | "dismissed", actor: string): Promise<void> {
  const { error } = await table("public_correction_reports").update({ status, reviewed_by: actor, reviewed_at: new Date().toISOString() } as never).eq("id", id);
  if (error) throw new Error(error.message);
}

interface OfferRow {
  id: string; brand: string; product_id: string | null; purchase_location: string | null;
  promotion_type: string; discount_percent: number | null; fixed_discount_dollars?: number | null;
  promo_credit_dollars?: number | null; fee_waiver_dollars?: number | null; bonus_percent: number | null;
  points_multiplier: number | null; fixed_points?: number | null; points_program: string | null; threshold_dollars?: number | null;
  start_date: string | null; expiry_date: string | null; source_detail_url: string | null; last_checked_at: string;
}

export async function sealExpiredOfferOccurrence(offerId: string, today: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin().from("gift_card_offers").select("*").eq("id", offerId).single();
  if (error) throw new Error(error.message);
  const row = data as unknown as OfferRow;
  const source: ExpiredGiftCardOfferForHistory = {
    id: row.id, brand: row.brand, productId: row.product_id, seller: row.purchase_location,
    promotionType: row.promotion_type, discountPercent: row.discount_percent,
    fixedDiscountDollars: row.fixed_discount_dollars ?? null, promoCreditDollars: row.promo_credit_dollars ?? null,
    feeWaiverDollars: row.fee_waiver_dollars ?? null, bonusPercent: row.bonus_percent,
    pointsMultiplier: row.points_multiplier, fixedPoints: row.fixed_points ?? null,
    pointsProgramme: row.points_program,
    thresholdDollars: row.threshold_dollars ?? null, startDate: row.start_date, endDate: row.expiry_date,
    sourceUrl: row.source_detail_url, verifiedAt: row.last_checked_at,
  };
  const snapshot = buildOfferOccurrenceSnapshot(source, today);
  const result = await table("gift_card_offer_occurrences").insert(snapshot as never);
  if (result.error) throw new Error(result.error.message);
}
