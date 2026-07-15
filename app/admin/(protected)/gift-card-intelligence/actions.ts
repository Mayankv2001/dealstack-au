"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit, type AdminActionResult } from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import { archiveIntelligenceRecord, getGiftCardProductSourceEvidence, insertGiftCardProduct, insertProgramme, insertProgrammeRate, isProductCatalogueSchemaAvailable, sealExpiredOfferOccurrence, setGiftCardFactPublished, setIntelligencePublished, setPublicCorrectionStatus, updateGiftCardProduct, updateProgrammeRateRecord, updateProgrammeRecord } from "@/lib/admin/repos/giftCardIntelligence";
import { todayAU } from "@/lib/offers/expiry";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

export type IntelligenceFormState = { error?: string; success?: string };

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const numberOrNull = (form: FormData, name: string): number | null => {
  const raw = text(form, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
};
const checked = (form: FormData, name: string) => form.get(name) === "on";
const PRODUCT_NETWORKS = ["unknown", "visa", "mastercard", "eftpos", "closed-loop"] as const;
const PRODUCT_FORMATS = ["digital", "physical", "digital-and-physical", "unknown"] as const;
const PRODUCT_WALLETS = ["supported", "unsupported", "partial", "unknown"] as const;
const TRI_STATE_VALUES = ["unknown", "yes", "no"] as const;
const list = (form: FormData, name: string): string[] => [
  ...new Set(
    text(form, name)
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)
  ),
];

type ProductCatalogueFields = {
  aliases: string[];
  official_product_page: string | null;
  activation_method: string | null;
  online_available: boolean | null;
  in_store_available: boolean | null;
  denominations: number[] | null;
  activation_delay_note: string | null;
  split_payment: "supported" | "unsupported" | "partial" | "unknown";
  expiry_or_fees_note: string | null;
  evidenceFields: string[];
};

function productCatalogueFields(
  form: FormData
): ProductCatalogueFields | { error: string } {
  const aliases = list(form, "aliases");
  const officialRaw = text(form, "official_product_page");
  const officialProductPage = officialRaw ? safeHttpsUrl(officialRaw) : null;
  const activationMethod = text(form, "activation_method") || null;
  const activationDelayNote = text(form, "activation_delay_note") || null;
  const expiryOrFeesNote = text(form, "expiry_or_fees_note") || null;
  const online = text(form, "online_available") || "unknown";
  const inStore = text(form, "in_store_available") || "unknown";
  const splitPayment = text(form, "split_payment") || "unknown";
  const denominationValues = list(form, "denominations");
  const denominations = denominationValues.length
    ? denominationValues.map(Number)
    : null;

  if (officialRaw && !officialProductPage) return { error: "Official product page must be a safe HTTPS URL." };
  if (!['unknown', 'yes', 'no'].includes(online) || !['unknown', 'yes', 'no'].includes(inStore)) {
    return { error: "Choose valid online and in-store availability values." };
  }
  if (!['supported', 'unsupported', 'partial', 'unknown'].includes(splitPayment)) {
    return { error: "Choose a valid split-payment value." };
  }
  if (denominations?.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { error: "Denominations must be positive numbers separated by commas." };
  }

  const evidenceFields = [
    ...(aliases.length ? ["aliases"] : []),
    ...(officialProductPage ? ["official_product_page"] : []),
    ...(activationMethod ? ["activation_method"] : []),
    ...(online !== "unknown" ? ["online_available"] : []),
    ...(inStore !== "unknown" ? ["in_store_available"] : []),
    ...(denominations ? ["denominations"] : []),
    ...(activationDelayNote ? ["activation_delay_note"] : []),
    ...(splitPayment !== "unknown" ? ["split_payment"] : []),
    ...(expiryOrFeesNote ? ["expiry_or_fees_note"] : []),
  ];
  return {
    aliases,
    official_product_page: officialProductPage,
    activation_method: activationMethod,
    online_available: online === "unknown" ? null : online === "yes",
    in_store_available: inStore === "unknown" ? null : inStore === "yes",
    denominations: denominations ? [...new Set(denominations)].sort((a, b) => a - b) : null,
    activation_delay_note: activationDelayNote,
    split_payment: splitPayment as ProductCatalogueFields["split_payment"],
    expiry_or_fees_note: expiryOrFeesNote,
    evidenceFields,
  };
}

function productEvidence(sourceUrl: string, fields: string[]) {
  return [{
    url: sourceUrl,
    checkedAt: new Date().toISOString(),
    status: "reviewed",
    fields: [...new Set(fields)],
  }];
}

async function adminGate() {
  const { email } = await requireAdmin();
  const limit = await checkAdminRateLimit({ adminEmail: email });
  return { email, error: limit.success ? null : limit.error };
}

function refresh() {
  revalidatePath("/admin/gift-card-intelligence");
  revalidatePath("/gift-cards/programmes");
  revalidatePath("/gift-cards/history");
}

export async function createProgramme(_state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const id = text(form, "id").toLowerCase();
  const provider = text(form, "provider");
  const name = text(form, "name");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const reviewBy = text(form, "review_by_date");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return { error: "ID must be a lowercase slug." };
  if (!provider || !name) return { error: "Provider and programme name are required." };
  if (!sourceUrl) return { error: "A safe HTTPS programme source is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy) || reviewBy < todayAU()) return { error: "Review-by date must be today or later." };
  try {
    await insertProgramme({ id, provider, name, programme_kind: text(form, "programme_kind") || "membership-catalogue", membership_required: checked(form, "membership_required"), account_required: checked(form, "account_required"), account_requirement: text(form, "account_requirement") || null, payment_requirement: text(form, "payment_requirement") || null, source_url: sourceUrl, confidence: checked(form, "confirmed") ? "confirmed" : "needs-verification", last_checked_at: new Date().toISOString(), review_by_date: reviewBy, is_published: false });
    await logAudit({ actorEmail: gate.email, action: "create", tableName: "gift_card_programmes", rowId: id, diff: { provider, name } });
    refresh();
    return { success: "Programme saved as an unpublished reviewed record." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create programme." };
  }
}

export async function createGiftCardProduct(_state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const id = text(form, "id").toLowerCase();
  const slug = text(form, "slug").toLowerCase();
  const brand = text(form, "brand");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const network = text(form, "card_network") || "unknown";
  const format = text(form, "format");
  const wallet = text(form, "mobile_wallet");
  const variableLoad = text(form, "variable_load") || "unknown";
  const min = numberOrNull(form, "min_denomination");
  const max = numberOrNull(form, "max_denomination");
  const catalogue = productCatalogueFields(form);
  if (![id, slug].every((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) || !brand) return { error: "Product ID, slug and brand are required; IDs must be lowercase slugs." };
  if (!sourceUrl) return { error: "A safe HTTPS product evidence URL is required." };
  if (!PRODUCT_NETWORKS.includes(network as (typeof PRODUCT_NETWORKS)[number])) return { error: "Choose a valid card network." };
  if (!PRODUCT_FORMATS.includes(format as (typeof PRODUCT_FORMATS)[number]) || !PRODUCT_WALLETS.includes(wallet as (typeof PRODUCT_WALLETS)[number])) return { error: "Choose valid format and wallet values." };
  if (!TRI_STATE_VALUES.includes(variableLoad as (typeof TRI_STATE_VALUES)[number])) return { error: "Choose a valid variable-load value." };
  if ([min, max].some((value) => value != null && (!Number.isFinite(value) || value < 0)) || (min != null && max != null && min > max)) return { error: "Denomination range is invalid." };
  if ("error" in catalogue) return catalogue;
  if (catalogue.evidenceFields.length && !(await isProductCatalogueSchemaAvailable())) {
    return { error: "Migration 028 is required before catalogue fields can be saved." };
  }
  try {
    const { evidenceFields: catalogueEvidenceFields, ...catalogueColumns } = catalogue;
    const evidenceFields = ["id", "brand", "slug", "category_restricted", ...(text(form, "issuer") ? ["issuer"] : []), ...(network !== "unknown" ? ["card_network"] : []), ...(format !== "unknown" ? ["format"] : []), ...(variableLoad !== "unknown" ? ["variable_load"] : []), ...(min != null ? ["min_denomination"] : []), ...(max != null ? ["max_denomination"] : []), ...(wallet !== "unknown" ? ["mobile_wallet"] : []), ...(text(form, "redemption_notes") ? ["redemption_notes"] : []), ...catalogueEvidenceFields];
    await insertGiftCardProduct({ id, slug, brand, issuer: text(form, "issuer") || null, card_network: network === "unknown" ? "unknown" : network, format, variable_load: variableLoad === "unknown" ? null : variableLoad === "yes", min_denomination: min, max_denomination: max, category_restricted: checked(form, "category_restricted"), mobile_wallet: wallet, redemption_notes: text(form, "redemption_notes") || null, ...(catalogueEvidenceFields.length ? catalogueColumns : {}), source_evidence: productEvidence(sourceUrl, evidenceFields), is_active: false });
    await logAudit({ actorEmail: gate.email, action: "create", tableName: "gift_card_products", rowId: id, diff: { brand, slug, catalogueFields: catalogueEvidenceFields }, forceExplicit: true });
    refresh();
    return { success: "Product saved inactive for final publication review." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create product." };
  }
}

export async function updateGiftCardProductAction(id: string, _state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const catalogue = productCatalogueFields(form);
  if (!sourceUrl) return { error: "A safe HTTPS product evidence URL is required." };
  if ("error" in catalogue) return catalogue;
  if (!(await isProductCatalogueSchemaAvailable())) {
    return { error: "Migration 028 is required before catalogue fields can be updated." };
  }
  try {
    const existingEvidence = await getGiftCardProductSourceEvidence(id);
    await updateGiftCardProduct(id, {
      aliases: catalogue.aliases,
      official_product_page: catalogue.official_product_page,
      activation_method: catalogue.activation_method,
      online_available: catalogue.online_available,
      in_store_available: catalogue.in_store_available,
      denominations: catalogue.denominations,
      activation_delay_note: catalogue.activation_delay_note,
      split_payment: catalogue.split_payment,
      expiry_or_fees_note: catalogue.expiry_or_fees_note,
      source_evidence: catalogue.evidenceFields.length
        ? [...existingEvidence, ...productEvidence(sourceUrl, catalogue.evidenceFields)]
        : existingEvidence,
    });
    await logAudit({ actorEmail: gate.email, action: "update", tableName: "gift_card_products", rowId: id, diff: { catalogueFields: catalogue.evidenceFields }, forceExplicit: true });
    refresh();
    revalidatePath("/gift-cards/products");
    return { success: "Product catalogue facts updated and rechecked." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update product catalogue facts." };
  }
}

export async function createGiftCardAcceptance(_state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  void form;
  return {
    error:
      "Direct acceptance entry is closed. Capture evidence in the acceptance review queue so alias resolution, evidence validation and reviewed RPC approval cannot be bypassed.",
  };
}

export async function toggleGiftCardFactPublished(kind: "product" | "acceptance", id: string, published: boolean): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  if (kind === "acceptance" && published) {
    return {
      error:
        "Acceptance publication is available only through the reviewed acceptance-candidate RPC.",
    };
  }
  try {
    await setGiftCardFactPublished(kind, id, published);
    const tableName = kind === "product" ? "gift_card_products" : "gift_card_merchant_acceptance";
    await logAudit({ actorEmail: gate.email, action: published ? "publish" : "unpublish", tableName, rowId: id });
    refresh();
    revalidatePath("/gift-cards/products");
    revalidatePath("/gift-cards/where-to-use");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update publication state." };
  }
}

export async function createProgrammeRate(_state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const programmeId = text(form, "programme_id");
  const brandName = text(form, "brand_name");
  const rateKey = text(form, "rate_key").toLowerCase();
  const promotionType = text(form, "promotion_type");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const reviewBy = text(form, "review_by_date");
  const discount = numberOrNull(form, "discount_percent");
  const fixed = numberOrNull(form, "fixed_discount_dollars");
  const bonus = numberOrNull(form, "bonus_percent");
  const fee = numberOrNull(form, "fee_waiver_dollars");
  const threshold = numberOrNull(form, "threshold_dollars");
  if (!programmeId || !brandName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rateKey)) return { error: "Programme, brand and a lowercase rate key are required." };
  if (!sourceUrl) return { error: "A safe product-specific HTTPS source is required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy) || reviewBy < todayAU()) return { error: "Review-by date must be today or later." };
  if ([discount, fixed, bonus, fee, threshold].some((value) => value != null && (!Number.isFinite(value) || value < 0))) return { error: "Rate values must be non-negative numbers." };
  const mechanicValid = (promotionType === "discount" && (discount ?? 0) > 0 && discount! < 100) || (promotionType === "fixed-dollar-discount" && (fixed ?? 0) > 0 && (threshold ?? 0) > 0) || (promotionType === "bonus-value" && (bonus ?? 0) > 0) || promotionType === "fee-waiver";
  if (!mechanicValid) return { error: "Enter the structured value required for the selected mechanic." };
  try {
    await insertProgrammeRate({ programme_id: programmeId, rate_key: rateKey, brand_name: brandName, promotion_type: promotionType, discount_percent: discount, fixed_discount_dollars: fixed, bonus_percent: bonus, fee_waiver_dollars: fee, threshold_dollars: threshold, membership_tier: text(form, "membership_tier") || null, payment_requirement: text(form, "payment_requirement") || null, is_ongoing: true, is_active: true, source_url: sourceUrl, confidence: checked(form, "confirmed") ? "confirmed" : "needs-verification", last_checked_at: new Date().toISOString(), review_by_date: reviewBy, is_published: false });
    await logAudit({ actorEmail: gate.email, action: "create", tableName: "gift_card_programme_rates", rowId: rateKey, diff: { programmeId, brandName, promotionType } });
    refresh();
    return { success: "Product-specific rate saved unpublished." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create rate." };
  }
}

export async function updateProgramme(id: string, _state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const provider = text(form, "provider");
  const name = text(form, "name");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const termsRaw = text(form, "terms_url");
  const termsUrl = termsRaw ? safeHttpsUrl(termsRaw) : null;
  const reviewBy = text(form, "review_by_date");
  if (!provider || !name || !sourceUrl) return { error: "Provider, name and safe HTTPS source are required." };
  if (termsRaw && !termsUrl) return { error: "Terms URL must be safe HTTPS." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy) || reviewBy < todayAU()) return { error: "Review-by date must be today or later." };
  try {
    await updateProgrammeRecord(id, { provider, name, programme_kind: text(form, "programme_kind"), membership_required: checked(form, "membership_required"), account_required: checked(form, "account_required"), account_requirement: text(form, "account_requirement") || null, payment_requirement: text(form, "payment_requirement") || null, source_url: sourceUrl, terms_url: termsUrl, confidence: checked(form, "confirmed") ? "confirmed" : "needs-verification", last_checked_at: new Date().toISOString(), review_by_date: reviewBy });
    await logAudit({ actorEmail: gate.email, action: "update", tableName: "gift_card_programmes", rowId: id, diff: { provider, name, reviewBy } });
    refresh();
    return { success: "Programme updated and rechecked." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update programme." };
  }
}

export async function updateProgrammeRate(id: string, _state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const brandName = text(form, "brand_name");
  const promotionType = text(form, "promotion_type");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const reviewBy = text(form, "review_by_date");
  const discount = numberOrNull(form, "discount_percent");
  const fixed = numberOrNull(form, "fixed_discount_dollars");
  const bonus = numberOrNull(form, "bonus_percent");
  const fee = numberOrNull(form, "fee_waiver_dollars");
  const threshold = numberOrNull(form, "threshold_dollars");
  const valid = (promotionType === "discount" && (discount ?? 0) > 0 && discount! < 100) || (promotionType === "fixed-dollar-discount" && (fixed ?? 0) > 0 && (threshold ?? 0) > 0) || (promotionType === "bonus-value" && (bonus ?? 0) > 0) || promotionType === "fee-waiver";
  if (!brandName || !sourceUrl || !valid) return { error: "Brand, product-specific source and the selected mechanic value are required." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewBy) || reviewBy < todayAU()) return { error: "Review-by date must be today or later." };
  try {
    await updateProgrammeRateRecord(id, { brand_name: brandName, promotion_type: promotionType, discount_percent: discount, fixed_discount_dollars: fixed, bonus_percent: bonus, fee_waiver_dollars: fee, threshold_dollars: threshold, membership_tier: text(form, "membership_tier") || null, payment_requirement: text(form, "payment_requirement") || null, source_url: sourceUrl, confidence: checked(form, "confirmed") ? "confirmed" : "needs-verification", last_checked_at: new Date().toISOString(), review_by_date: reviewBy });
    await logAudit({ actorEmail: gate.email, action: "update", tableName: "gift_card_programme_rates", rowId: id, diff: { brandName, promotionType, reviewBy } });
    refresh();
    return { success: "Programme rate updated; its change history was appended." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update programme rate." };
  }
}

export async function archiveIntelligence(kind: "programme" | "rate", id: string): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  try {
    await archiveIntelligenceRecord(kind, id);
    await logAudit({ actorEmail: gate.email, action: "archive", tableName: kind === "programme" ? "gift_card_programmes" : "gift_card_programme_rates", rowId: id });
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not archive this record." };
  }
}

export async function toggleIntelligencePublished(kind: "programme" | "rate", id: string, published: boolean): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  try {
    await setIntelligencePublished(kind, id, published);
    await logAudit({ actorEmail: gate.email, action: published ? "publish" : "unpublish", tableName: kind === "programme" ? "gift_card_programmes" : "gift_card_programme_rates", rowId: id });
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update publication state." };
  }
}

export async function resolvePublicCorrection(id: string, status: "reviewed" | "dismissed"): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  try {
    await setPublicCorrectionStatus(id, status, gate.email);
    await logAudit({ actorEmail: gate.email, action: status, tableName: "public_correction_reports", rowId: id });
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not update report." };
  }
}

export async function sealOfferHistory(offerId: string): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  try {
    await sealExpiredOfferOccurrence(offerId, todayAU());
    await logAudit({ actorEmail: gate.email, action: "seal-history", tableName: "gift_card_offer_occurrences", rowId: offerId });
    refresh();
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not seal occurrence." };
  }
}
