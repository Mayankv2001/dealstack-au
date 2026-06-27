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
  CONFIDENCE_LEVELS,
  GIFT_CARD_CHANNELS,
  PURCHASE_METHODS,
  insertGiftCardOffer,
  setGiftCardPublished,
  updateGiftCardOffer as persistGiftCardOffer,
  type GiftCardChannel,
  type GiftCardOfferInput,
  type PurchaseMethod,
} from "@/lib/admin/repos/giftCards";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Gift-card admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate /deals so the published view reflects it, plus the
 * admin list. No external source calls.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type GiftCardFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: GiftCardOfferInput }
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

/** Optional free-text field. Blank → null. */
function parseOptionalText(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? "").trim();
  return text === "" ? null : text;
}

/** Splits a newline-separated textarea into a trimmed, blank-free list. */
function parseLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function parseGiftCardForm(formData: FormData): ParseResult {
  const brand = String(formData.get("brand") ?? "").trim();
  if (!brand) return { ok: false, error: "Brand is required." };

  const source = String(formData.get("source") ?? "").trim();
  if (!source) return { ok: false, error: "Source is required." };

  const channel = String(formData.get("channel") ?? "").trim();
  if (!GIFT_CARD_CHANNELS.includes(channel as GiftCardChannel)) {
    return { ok: false, error: "Choose a valid channel." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  // purchase_method is optional (the column is nullable). Blank → null.
  const methodRaw = String(formData.get("purchase_method") ?? "").trim();
  let purchaseMethod: PurchaseMethod | null = null;
  if (methodRaw !== "") {
    if (!PURCHASE_METHODS.includes(methodRaw as PurchaseMethod)) {
      return { ok: false, error: "Choose a valid purchase method." };
    }
    purchaseMethod = methodRaw as PurchaseMethod;
  }

  // discount_percent is required but defaults to 0 when left blank.
  let discountPercent = 0;
  const discountRaw = String(formData.get("discount_percent") ?? "").trim();
  if (discountRaw !== "") {
    const n = Number(discountRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Discount must be a non-negative number." };
    }
    discountPercent = n;
  }

  const cap = parseOptionalAmount(formData.get("cap_dollars"));
  if (!cap.ok) return { ok: false, error: "Cap must be a non-negative number." };

  const startDate = parseOptionalText(formData.get("start_date"));
  const expiryDate = parseOptionalText(formData.get("expiry_date"));

  // Points earned for buying the card itself. Both halves blank → no object.
  const pointsProgram = String(formData.get("points_program") ?? "").trim();
  const pointsEarnNote = String(formData.get("points_earn_note") ?? "").trim();
  const pointsOnPurchase =
    pointsProgram === ""
      ? null
      : { program: pointsProgram, earnNote: pointsEarnNote };

  // A single source URL is stored as a manual citation (matches the cashback
  // admin and what the public site renders). Blank → no citation.
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const citations: Citation[] = [];
  if (sourceUrl !== "") {
    if (!URL.canParse(sourceUrl)) {
      return { ok: false, error: "Source URL must be a valid URL (including https://)." };
    }
    citations.push({ source: "manual", sourceUrl });
  }

  const sourceDetailUrl = parseOptionalText(formData.get("source_detail_url"));
  if (sourceDetailUrl !== null && !URL.canParse(sourceDetailUrl)) {
    return { ok: false, error: "Source detail URL must be a valid URL (including https://)." };
  }

  return {
    ok: true,
    input: {
      brand,
      discountPercent,
      channel: channel as GiftCardChannel,
      source,
      acceptedAtMerchantIds: formData
        .getAll("accepted_at_merchant_ids")
        .map((v) => String(v).trim())
        .filter((v) => v !== ""),
      pointsOnPurchase,
      capDollars: cap.value,
      startDate,
      expiryDate,
      purchaseLocation: parseOptionalText(formData.get("purchase_location")),
      purchaseMethod,
      limitPerCustomer: parseOptionalText(formData.get("limit_per_customer")),
      acceptedAt: parseLines(formData.get("accepted_at")),
      usageNotes: parseLines(formData.get("usage_notes")),
      stackNotes: parseLines(formData.get("stack_notes")),
      sourceDetailUrl,
      citations,
      confidence: confidence as Confidence,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/** On-demand revalidation of every surface a gift-card change affects. */
function revalidateGiftCards(): void {
  revalidatePath("/deals");
  revalidatePath("/admin/gift-cards");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createGiftCardOffer(
  _prev: GiftCardFormState,
  formData: FormData
): Promise<GiftCardFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseGiftCardForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = await insertGiftCardOffer(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "gift_card_offers",
    rowId: id,
    diff: {
      brand: parsed.input.brand,
      source: parsed.input.source,
      discountPercent: parsed.input.discountPercent,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateGiftCards();
  redirect("/admin/gift-cards");
}

export async function updateGiftCardOffer(
  id: string,
  _prev: GiftCardFormState,
  formData: FormData
): Promise<GiftCardFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseGiftCardForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistGiftCardOffer(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "gift_card_offers",
    rowId: id,
    diff: {
      brand: parsed.input.brand,
      source: parsed.input.source,
      discountPercent: parsed.input.discountPercent,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateGiftCards();
  redirect("/admin/gift-cards");
}

/** Publish / unpublish toggle invoked from the list view (bound id + next value). */
export async function setPublished(
  id: string,
  isPublished: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setGiftCardPublished(id, isPublished);
  await logAudit({
    actorEmail: email,
    action: isPublished ? "publish" : "unpublish",
    tableName: "gift_card_offers",
    rowId: id,
    diff: { isPublished },
  });
  revalidateGiftCards();
  return { ok: true };
}
