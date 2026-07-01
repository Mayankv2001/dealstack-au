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
  OFFER_TYPES,
  insertCardOffer,
  setCardOfferPublished,
  updateCardOffer as persistCardOffer,
  type CardOfferInput,
  type OfferType,
} from "@/lib/admin/repos/cardOffers";
import type { Confidence } from "@/lib/sources/types";

/**
 * Card-offer admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role
 * writes live in the admin repo; nothing here is reachable from the public
 * site. After any change we revalidate the admin list (there is no public
 * /cards page yet — this phase stops at admin CRUD). No external source
 * calls: this is manual entry only.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type CardOfferFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: CardOfferInput }
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

function parseCardOfferForm(formData: FormData): ParseResult {
  const provider = String(formData.get("provider") ?? "").trim();
  if (!provider) return { ok: false, error: "Provider/bank is required." };

  const cardName = String(formData.get("card_name") ?? "").trim();
  if (!cardName) return { ok: false, error: "Card name is required." };

  const offerType = String(formData.get("offer_type") ?? "").trim();
  if (!OFFER_TYPES.includes(offerType as OfferType)) {
    return { ok: false, error: "Choose a valid offer type." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  const bonusPoints = parseOptionalAmount(formData.get("bonus_points"));
  if (!bonusPoints.ok) {
    return { ok: false, error: "Bonus points must be a non-negative number." };
  }

  const cashbackAmount = parseOptionalAmount(formData.get("cashback_amount"));
  if (!cashbackAmount.ok) {
    return { ok: false, error: "Cashback amount must be a non-negative number." };
  }

  const statementCreditAmount = parseOptionalAmount(
    formData.get("statement_credit_amount")
  );
  if (!statementCreditAmount.ok) {
    return {
      ok: false,
      error: "Statement credit amount must be a non-negative number.",
    };
  }

  const minimumSpend = parseOptionalAmount(formData.get("minimum_spend"));
  if (!minimumSpend.ok) {
    return { ok: false, error: "Minimum spend must be a non-negative number." };
  }

  const annualFee = parseOptionalAmount(formData.get("annual_fee"));
  if (!annualFee.ok) {
    return { ok: false, error: "Annual fee must be a non-negative number." };
  }

  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  if (sourceUrl !== "" && !URL.canParse(sourceUrl)) {
    return { ok: false, error: "Source URL must be a valid URL (including https://)." };
  }

  const expiryDate = parseOptionalText(formData.get("expiry_date"));

  return {
    ok: true,
    input: {
      provider,
      cardName,
      offerType: offerType as OfferType,
      bonusPoints: bonusPoints.value,
      cashbackAmount: cashbackAmount.value,
      statementCreditAmount: statementCreditAmount.value,
      minimumSpend: minimumSpend.value,
      minimumSpendPeriod: parseOptionalText(formData.get("minimum_spend_period")),
      annualFee: annualFee.value,
      eligibilityNotes: String(formData.get("eligibility_notes") ?? "").trim(),
      offerSummary: String(formData.get("offer_summary") ?? "").trim(),
      sourceUrl,
      confidence: confidence as Confidence,
      expiryDate,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/** On-demand revalidation of every surface a card-offer change affects. */
function revalidateCardOffers(): void {
  revalidatePath("/admin/card-offers");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createCardOffer(
  _prev: CardOfferFormState,
  formData: FormData
): Promise<CardOfferFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseCardOfferForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = await insertCardOffer(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "card_offers",
    rowId: id,
    diff: {
      provider: parsed.input.provider,
      cardName: parsed.input.cardName,
      offerType: parsed.input.offerType,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateCardOffers();
  redirect("/admin/card-offers");
}

export async function updateCardOffer(
  id: string,
  _prev: CardOfferFormState,
  formData: FormData
): Promise<CardOfferFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseCardOfferForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistCardOffer(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "card_offers",
    rowId: id,
    diff: {
      provider: parsed.input.provider,
      cardName: parsed.input.cardName,
      offerType: parsed.input.offerType,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateCardOffers();
  redirect("/admin/card-offers");
}

/** Publish / unpublish toggle invoked from the list view (bound id + next value). */
export async function setPublished(
  id: string,
  isPublished: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setCardOfferPublished(id, isPublished);
  await logAudit({
    actorEmail: email,
    action: isPublished ? "publish" : "unpublish",
    tableName: "card_offers",
    rowId: id,
    diff: { isPublished },
  });
  revalidateCardOffers();
  return { ok: true };
}
