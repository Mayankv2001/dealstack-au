"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit } from "@/lib/admin/rate-limit";
import {
  approveGiftCardCandidate,
  setCandidateStatus,
} from "@/lib/admin/repos/giftCardPipeline";
import { logAudit } from "@/lib/admin/repos/audit";
import { effectiveDiscountPercent } from "@/lib/giftcards/value";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/** Returned to the review forms. Empty object means success. */
export type ReviewActionState = { error?: string };

/**
 * Gift-card candidate review actions. SECURITY: every action calls
 * requireAdmin() first; approval goes through the transactional
 * approve_gift_card_candidate RPC (guarded candidate state + offer upsert +
 * audit in one transaction). The admin's EDITED values are authoritative —
 * parser output is only a suggestion and nothing auto-approves.
 */

const PROMOTION_TYPES = ["discount", "bonus-value", "points", "membership"];
const CHANNELS = ["membership-portal", "supermarket-promo", "bank-benefit"];
const FORMATS = ["digital", "physical", "digital-and-physical", "unknown"];

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function num(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function isoDate(form: FormData, name: string): string | null {
  const raw = String(form.get(name) ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function list(form: FormData, name: string): string[] {
  return String(form.get(name) ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function approveCandidate(
  candidateId: string,
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const brand = String(formData.get("brand") ?? "").trim();
  if (!brand) return { error: "Brand is required." };

  const promotionType = String(formData.get("promotion_type") ?? "discount");
  if (!PROMOTION_TYPES.includes(promotionType)) {
    return { error: "Unknown promotion type." };
  }
  const channel = String(formData.get("channel") ?? "supermarket-promo");
  if (!CHANNELS.includes(channel)) return { error: "Unknown channel." };
  const format = String(formData.get("format") ?? "unknown");
  if (!FORMATS.includes(format)) return { error: "Unknown format." };

  const discountPercent = num(formData, "discount_percent");
  const bonusPercent = num(formData, "bonus_percent");
  const pointsMultiplier = num(formData, "points_multiplier");
  const pointsProgram = String(formData.get("points_program") ?? "").trim() || null;
  const pointsValueCents = num(formData, "points_value_cents");
  if (
    promotionType === "discount" &&
    (!discountPercent || discountPercent <= 0 || discountPercent >= 100)
  ) {
    return { error: "A discount offer needs a percentage between 0 and 100." };
  }
  if (promotionType === "points" && (!pointsMultiplier || !pointsProgram)) {
    return { error: "A points offer needs a multiplier and a programme." };
  }
  if (promotionType === "bonus-value" && (!bonusPercent || bonusPercent <= 0)) {
    return { error: "A bonus-value offer needs a bonus percentage." };
  }

  const sourceUrlRaw = String(formData.get("source_url") ?? "").trim();
  const sourceUrl = sourceUrlRaw ? safeHttpsUrl(sourceUrlRaw) : null;
  if (sourceUrlRaw && !sourceUrl) {
    return { error: "Source URL must be a safe HTTPS URL." };
  }

  const seller = String(formData.get("seller") ?? "").trim();
  const offerId =
    String(formData.get("offer_id") ?? "").trim() ||
    `gc-${slugify(`${brand}-${seller || promotionType}`)}`;

  const offer = {
    brand,
    discount_percent: discountPercent ?? 0,
    channel,
    source: String(formData.get("source_name") ?? "GCDB").trim() || "GCDB",
    accepted_at_merchant_ids: list(formData, "accepted_at_merchant_ids"),
    points_on_purchase:
      promotionType === "points" && pointsProgram
        ? {
            program: pointsProgram,
            earnNote: `${pointsMultiplier}x ${pointsProgram} points on purchase`,
          }
        : null,
    cap_dollars: num(formData, "cap_dollars"),
    expiry_date: isoDate(formData, "expiry_date"),
    start_date: isoDate(formData, "start_date"),
    purchase_location: seller || null,
    purchase_method: "unknown",
    limit_per_customer:
      String(formData.get("limit_per_customer") ?? "").trim() || null,
    accepted_at: list(formData, "accepted_at"),
    usage_notes: list(formData, "usage_notes"),
    stack_notes: list(formData, "stack_notes"),
    source_detail_url: sourceUrl,
    citations: sourceUrl ? [{ source: "gcdb", sourceUrl }] : [],
    confidence: "needs-verification",
    promotion_type: promotionType,
    bonus_percent: bonusPercent,
    points_multiplier: pointsMultiplier,
    points_program: pointsProgram,
    points_value_cents: pointsValueCents,
    membership_required: formData.get("membership_required") === "on",
    activation_required: formData.get("activation_required") === "on",
    coupon_required: formData.get("coupon_required") === "on",
    min_spend: num(formData, "min_spend"),
    denomination_note:
      String(formData.get("denomination_note") ?? "").trim() || null,
    format,
    source_name: "Gift Card Database",
    product_id: null,
  };

  // Guard the admin against a value that cannot be presented honestly.
  const effective = effectiveDiscountPercent({
    promotionType,
    discountPercent,
    bonusPercent,
    pointsMultiplier,
    pointsProgram,
    pointsValueCents,
  });
  if (promotionType !== "membership" && effective == null) {
    return {
      error:
        "No effective value could be calculated — set a discount, bonus or points value (with a programme).",
    };
  }

  try {
    await approveGiftCardCandidate(candidateId, offerId, offer, email);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Approval failed.",
    };
  }

  revalidatePath("/gift-cards");
  revalidatePath("/deals");
  revalidatePath("/admin/gift-cards/review");
  return {};
}

export async function rejectCandidate(
  candidateId: string,
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };
  const reason = String(formData.get("reason") ?? "").trim() || "Not suitable";
  await setCandidateStatus(candidateId, "rejected", email, reason);
  await logAudit({
    actorEmail: email,
    action: "reject-gift-card-candidate",
    tableName: "gift_card_offer_candidates",
    rowId: candidateId,
    diff: { reason },
  });
  revalidatePath("/admin/gift-cards/review");
  return {};
}

export async function archiveCandidate(
  candidateId: string
): Promise<ReviewActionState> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };
  await setCandidateStatus(candidateId, "archived", email);
  await logAudit({
    actorEmail: email,
    action: "archive-gift-card-candidate",
    tableName: "gift_card_offer_candidates",
    rowId: candidateId,
  });
  revalidatePath("/admin/gift-cards/review");
  return {};
}

/** Reopen a rejected candidate for another pass ("request reprocessing"). */
export async function reopenCandidate(
  candidateId: string
): Promise<ReviewActionState> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };
  await setCandidateStatus(candidateId, "new", email);
  await logAudit({
    actorEmail: email,
    action: "reopen-gift-card-candidate",
    tableName: "gift_card_offer_candidates",
    rowId: candidateId,
  });
  revalidatePath("/admin/gift-cards/review");
  return {};
}
