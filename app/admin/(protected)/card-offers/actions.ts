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
 * site. After any change we revalidate every public/admin surface that consumes
 * card offers. RLS removes drafts and the public repository adds a readiness
 * gate. No external source calls: this is manual entry only, and nothing here
 * publishes without the admin's explicit flag/toggle and a readiness check.
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

/**
 * Optional date field. Blank → null; otherwise must be a real calendar date in
 * YYYY-MM-DD form (what <input type="date"> submits and the `date` column
 * expects) — validated here so a malformed value becomes a friendly form error
 * instead of a Postgres error.
 */
function parseOptionalDate(
  raw: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: null };
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false };
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return isRealDate ? { ok: true, value: text } : { ok: false };
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

  const expiryDate = parseOptionalDate(formData.get("expiry_date"));
  if (!expiryDate.ok) {
    return {
      ok: false,
      error: "Expiry date must be a real date in YYYY-MM-DD format (or blank).",
    };
  }

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
      expiryDate: expiryDate.value,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/**
 * On-demand revalidation of every surface a card-offer change affects: the
 * admin list plus the public /cards page, so a publish/unpublish/edit shows up
 * immediately instead of waiting out the 5-minute ISR window. RLS keeps drafts
 * out of the public read either way.
 */
function revalidateCardOffers(): void {
  revalidatePath("/admin/card-offers");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/cleanup");
  revalidatePath("/cards");
  revalidatePath("/search");
}

/** Friendly message for a failed repo write (details stay in server logs). */
function writeFailed(err: unknown, verb: string): string {
  console.error(`[admin/card-offers] ${verb} failed:`, err);
  return `Could not ${verb} this card offer — please try again.`;
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

  let id: string;
  try {
    const result = await insertCardOffer(parsed.input);
    if (!result.ok) return { error: result.error };
    id = result.id;
  } catch (err) {
    return { error: writeFailed(err, "create") };
  }
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

  try {
    const result = await persistCardOffer(id, parsed.input);
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return { error: writeFailed(err, "update") };
  }
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

  try {
    const result = await setCardOfferPublished(id, isPublished);
    if (!result.ok) return { error: result.error };
  } catch (err) {
    return { error: writeFailed(err, isPublished ? "publish" : "unpublish") };
  }
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
