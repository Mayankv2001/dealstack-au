"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit, type AdminActionResult } from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import { archiveIntelligenceRecord, insertGiftCardAcceptance, insertGiftCardProduct, insertProgramme, insertProgrammeRate, sealExpiredOfferOccurrence, setGiftCardFactPublished, setIntelligencePublished, setPublicCorrectionStatus, updateProgrammeRateRecord, updateProgrammeRecord } from "@/lib/admin/repos/giftCardIntelligence";
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
  const format = text(form, "format");
  const wallet = text(form, "mobile_wallet");
  const min = numberOrNull(form, "min_denomination");
  const max = numberOrNull(form, "max_denomination");
  if (![id, slug].every((value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) || !brand) return { error: "Product ID, slug and brand are required; IDs must be lowercase slugs." };
  if (!sourceUrl) return { error: "A safe HTTPS product evidence URL is required." };
  if (!["digital", "physical", "digital-and-physical", "unknown"].includes(format) || !["supported", "unsupported", "partial", "unknown"].includes(wallet)) return { error: "Choose valid format and wallet values." };
  if ([min, max].some((value) => value != null && (!Number.isFinite(value) || value < 0)) || (min != null && max != null && min > max)) return { error: "Denomination range is invalid." };
  try {
    await insertGiftCardProduct({ id, slug, brand, issuer: text(form, "issuer") || null, card_network: text(form, "card_network") || null, format, variable_load: text(form, "variable_load") === "unknown" ? null : text(form, "variable_load") === "yes", min_denomination: min, max_denomination: max, category_restricted: checked(form, "category_restricted"), mobile_wallet: wallet, redemption_notes: text(form, "redemption_notes") || null, source_evidence: [{ url: sourceUrl, checkedAt: new Date().toISOString(), status: "reviewed" }], is_active: false });
    await logAudit({ actorEmail: gate.email, action: "create", tableName: "gift_card_products", rowId: id, diff: { brand, slug } });
    refresh();
    return { success: "Product saved inactive for final publication review." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create product." };
  }
}

export async function createGiftCardAcceptance(_state: IntelligenceFormState, form: FormData): Promise<IntelligenceFormState> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
  const productId = text(form, "product_id");
  const merchantName = text(form, "merchant_name");
  const merchantCategory = text(form, "merchant_category");
  const sourceUrl = safeHttpsUrl(text(form, "source_url"));
  const checkedAt = text(form, "checked_at");
  const status = text(form, "status");
  const outcome = text(form, "outcome");
  const mcc = numberOrNull(form, "mcc");
  if (!productId || (!merchantName && !merchantCategory)) return { error: "Product and merchant name or category are required." };
  if (!sourceUrl || !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt)) return { error: "Evidence URL and checked date are required." };
  if (!["verified", "claimed", "community"].includes(status) || !["successful", "unsuccessful"].includes(outcome)) return { error: "Choose a valid evidence status and outcome." };
  if (mcc != null && (!Number.isInteger(mcc) || mcc < 1 || mcc > 9999)) return { error: "MCC must be a four-digit integer when supplied." };
  try {
    await insertGiftCardAcceptance({ product_id: productId, merchant_name: merchantName || null, merchant_category: merchantCategory || null, mcc, status, outcome, source_url: sourceUrl, checked_at: `${checkedAt}T00:00:00Z`, notes: text(form, "notes") || null, is_public: false });
    await logAudit({ actorEmail: gate.email, action: "create", tableName: "gift_card_merchant_acceptance", diff: { productId, merchantName, merchantCategory, status, outcome } });
    refresh();
    return { success: "Acceptance evidence saved privately for final publication review." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not create acceptance evidence." };
  }
}

export async function toggleGiftCardFactPublished(kind: "product" | "acceptance", id: string, published: boolean): Promise<AdminActionResult> {
  const gate = await adminGate();
  if (gate.error) return { error: gate.error };
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
