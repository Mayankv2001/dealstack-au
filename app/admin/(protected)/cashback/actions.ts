"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  CASHBACK_PROVIDERS,
  CONFIDENCE_LEVELS,
  insertCashbackOffer,
  setCashbackPublished,
  updateCashbackOffer as persistCashbackOffer,
  type CashbackOfferInput,
  type CashbackProvider,
} from "@/lib/admin/repos/cashback";
import type { Citation, Confidence } from "@/lib/sources/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Cashback admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate /deals so the published view reflects it, plus the
 * admin list. No external source calls.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type CashbackFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: CashbackOfferInput }
  | { ok: false; error: string };

/** Parses an optional non-negative number field. Blank → null. */
function parseOptionalAmount(
  raw: FormDataEntryValue | null
): { ok: true; value: number | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/** Native checkboxes only appear in FormData when checked. */
function parseBool(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

function parseCashbackForm(formData: FormData): ParseResult {
  const merchantId = String(formData.get("merchant_id") ?? "").trim();
  if (!merchantId) return { ok: false, error: "Select a store." };

  const provider = String(formData.get("provider") ?? "").trim();
  if (!CASHBACK_PROVIDERS.includes(provider as CashbackProvider)) {
    return { ok: false, error: "Choose a valid provider (ShopBack or TopCashback)." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  // rate_percent is required but defaults to 0 when left blank.
  let ratePercent = 0;
  const rateRaw = String(formData.get("rate_percent") ?? "").trim();
  if (rateRaw !== "") {
    const n = Number(rateRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Rate must be a non-negative number." };
    }
    ratePercent = n;
  }

  const flat = parseOptionalAmount(formData.get("flat_amount"));
  if (!flat.ok) return { ok: false, error: "Flat amount must be a non-negative number." };

  const cap = parseOptionalAmount(formData.get("cap_dollars"));
  if (!cap.ok) return { ok: false, error: "Cap must be a non-negative number." };

  const expiryRaw = String(formData.get("expiry_date") ?? "").trim();
  const expiryDate = expiryRaw === "" ? null : expiryRaw;

  // A single source URL is stored as a manual citation (the only field shape the
  // public site renders for cashback). Blank → no citation.
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const citations: Citation[] = [];
  if (sourceUrl !== "") {
    const safeSourceUrl = safeHttpsUrl(sourceUrl);
    if (!safeSourceUrl) {
      return { ok: false, error: "Source URL must be a safe HTTPS URL without credentials." };
    }
    citations.push({ source: "manual", sourceUrl: safeSourceUrl });
  }

  return {
    ok: true,
    input: {
      merchantId,
      provider: provider as CashbackProvider,
      ratePercent,
      flatAmount: flat.value,
      capDollars: cap.value,
      isUpsized: parseBool(formData, "is_upsized"),
      excludesGiftCardPayment: parseBool(formData, "excludes_gift_card_payment"),
      termsSummary: String(formData.get("terms_summary") ?? "").trim(),
      expiryDate,
      confidence: confidence as Confidence,
      citations,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/** On-demand revalidation of every surface a cashback change affects. */
function revalidateCashback(): void {
  revalidatePath("/deals");
  revalidatePath("/admin/cashback");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createCashbackOffer(
  _prev: CashbackFormState,
  formData: FormData
): Promise<CashbackFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseCashbackForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = await insertCashbackOffer(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "cashback_offers",
    rowId: id,
    diff: {
      merchantId: parsed.input.merchantId,
      provider: parsed.input.provider,
      ratePercent: parsed.input.ratePercent,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateCashback();
  redirect("/admin/cashback");
}

export async function updateCashbackOffer(
  id: string,
  _prev: CashbackFormState,
  formData: FormData
): Promise<CashbackFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseCashbackForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistCashbackOffer(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "cashback_offers",
    rowId: id,
    diff: {
      merchantId: parsed.input.merchantId,
      provider: parsed.input.provider,
      ratePercent: parsed.input.ratePercent,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateCashback();
  redirect("/admin/cashback");
}

/** Publish / unpublish toggle invoked from the list view (bound id + next value). */
export async function setPublished(
  id: string,
  isPublished: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setCashbackPublished(id, isPublished);
  await logAudit({
    actorEmail: email,
    action: isPublished ? "publish" : "unpublish",
    tableName: "cashback_offers",
    rowId: id,
    diff: { isPublished },
  });
  revalidateCashback();
  return { ok: true };
}
