"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit } from "@/lib/admin/rate-limit";
import {
  approveGiftCardCandidate,
  getGiftCardCandidateApprovalContext,
  listPublishedOfferSummaries,
  setCandidateStatus,
} from "@/lib/admin/repos/giftCardPipeline";
import { logAudit } from "@/lib/admin/repos/audit";
import { validateGiftCardApproval } from "@/lib/giftcards/approvalValidation";
import { findDuplicateOffers } from "@/lib/giftcards/duplicateDetection";

/** Returned to the review forms. Empty object means success. */
export type ReviewActionState = { error?: string };

/**
 * Gift-card candidate review actions. SECURITY: every action calls
 * requireAdmin() first; approval goes through the transactional
 * approve_gift_card_candidate RPC (guarded candidate state + offer upsert +
 * audit in one transaction). The admin's EDITED values are authoritative —
 * parser output is only a suggestion and nothing auto-approves.
 *
 * All material-field gating lives in lib/giftcards/approvalValidation.ts
 * (pure, unit-tested): seller, promotion value, included brand, source URL
 * and expiry-or-explicit-ongoing are required; malformed numbers, times,
 * timezones and URLs are explicit errors, never silently dropped.
 */

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function list(form: FormData, name: string): string[] {
  return String(form.get(name) ?? "")
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 20);
}

const text = (form: FormData, name: string): string =>
  String(form.get(name) ?? "");
const checked = (form: FormData, name: string): boolean =>
  form.get(name) === "on";

export async function approveCandidate(
  candidateId: string,
  _prev: ReviewActionState,
  formData: FormData
): Promise<ReviewActionState> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  let context: Awaited<ReturnType<typeof getGiftCardCandidateApprovalContext>>;
  try {
    context = await getGiftCardCandidateApprovalContext(candidateId);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Could not verify the candidate source context.",
    };
  }

  const validation = validateGiftCardApproval({
    brand: text(formData, "brand"),
    seller: text(formData, "seller"),
    promotionType: text(formData, "promotion_type"),
    channel: text(formData, "channel") || "supermarket-promo",
    format: text(formData, "format") || "unknown",
    discountPercent: text(formData, "discount_percent"),
    bonusPercent: text(formData, "bonus_percent"),
    pointsMultiplier: text(formData, "points_multiplier"),
    pointsProgram: text(formData, "points_program"),
    pointsValueCents: text(formData, "points_value_cents"),
    fixedDiscountDollars: text(formData, "fixed_discount_dollars"),
    promoCreditDollars: text(formData, "promo_credit_dollars"),
    feeWaiverDollars: text(formData, "fee_waiver_dollars"),
    thresholdDollars: text(formData, "threshold_dollars"),
    rewardDestination: text(formData, "reward_destination"),
    startDate: text(formData, "start_date"),
    expiryDate: text(formData, "expiry_date"),
    expiryTime: text(formData, "expiry_time"),
    expiryTimezone: text(formData, "expiry_timezone"),
    ongoing: checked(formData, "ongoing"),
    minSpend: text(formData, "min_spend"),
    capDollars: text(formData, "cap_dollars"),
    usesPerCustomer: text(formData, "uses_per_customer"),
    // Source identity is lineage, not reviewer input. Terms may be edited
    // separately, but the original source URL always comes from the stored raw
    // item so a form submission cannot replace or erase its evidence.
    sourceUrl: context.sourceUrl,
    termsUrl: text(formData, "terms_url"),
    promoCode: text(formData, "promo_code"),
    australiaOnly: text(formData, "australia_only"),
    combinableWithSellerPromotions: text(
      formData,
      "combinable_with_seller_promotions"
    ),
    membershipRequired: checked(formData, "membership_required"),
    activationRequired: checked(formData, "activation_required"),
    couponRequired: checked(formData, "coupon_required"),
    shippingMayApply: checked(formData, "shipping_may_apply"),
    targeted: checked(formData, "targeted"),
    sourceName: context.sourceName,
    sourceText: context.sourceText,
    thresholdText: context.sourceText,
    parentIsCompound: context.parentIsCompound,
    candidateRole: context.candidateRole,
    subOfferKey: context.subOfferKey,
    sourcePresence: context.sourcePresence,
  });
  if (!validation.ok) return { error: validation.error };
  const v = validation.values;

  const offerId =
    text(formData, "offer_id").trim() ||
    `gc-${slugify(`${v.brand}-${v.seller || v.promotionType}`)}`;

  // Duplicate/overlap guard: block re-publishing the same source page as a new
  // offer unless the reviewer has explicitly reviewed the duplicate. Probable/
  // overlapping matches are surfaced on the review card but do not block.
  try {
    const published = await listPublishedOfferSummaries();
    const today = new Date().toISOString().slice(0, 10);
    const exactDuplicates = findDuplicateOffers(
      {
        sellerName: v.seller,
        giftCardBrands: v.brand.split(",").map((b) => b.trim()).filter(Boolean),
        promotionType: v.promotionType,
        discountPercent: v.discountPercent,
        bonusPercent: v.bonusPercent,
        pointsMultiplier: v.pointsMultiplier,
        pointsProgram: v.pointsProgram,
        startsAt: v.startDate,
        expiresAt: v.expiryDate,
        sourceUrl: v.sourceUrl,
      },
      published,
      today
    ).filter((m) => m.verdict === "exact-duplicate" && m.offer.id !== offerId);
    if (exactDuplicates.length > 0 && !checked(formData, "duplicate_ack")) {
      return {
        error: `This exact source page is already published as ${exactDuplicates[0].offer.id}. Update that offer instead, reject this as a duplicate, or tick “I’ve reviewed the duplicate” to proceed.`,
      };
    }
  } catch {
    return {
      error:
        "Could not verify duplicate or overlapping published offers. Approval is blocked until that check succeeds.",
    };
  }

  const offer = {
    brand: v.brand,
    discount_percent: v.discountPercent ?? 0,
    channel: v.channel,
    source: v.sourceName,
    accepted_at_merchant_ids: list(formData, "accepted_at_merchant_ids"),
    points_on_purchase:
      v.promotionType === "points" && v.pointsProgram
        ? {
            program: v.pointsProgram,
            earnNote: `${v.pointsMultiplier}x ${v.pointsProgram} points on purchase`,
          }
        : null,
    cap_dollars: v.capDollars,
    expiry_date: v.expiryDate,
    start_date: v.startDate,
    purchase_location: v.seller,
    purchase_method: "unknown",
    limit_per_customer: text(formData, "limit_per_customer").trim() || null,
    accepted_at: list(formData, "accepted_at"),
    usage_notes: list(formData, "usage_notes"),
    stack_notes: list(formData, "stack_notes"),
    source_detail_url: v.sourceUrl,
    citations: [{ source: v.sourceName, sourceUrl: v.sourceUrl }],
    confidence: "needs-verification",
    promotion_type: v.promotionType,
    bonus_percent: v.bonusPercent,
    points_multiplier: v.pointsMultiplier,
    points_program: v.pointsProgram,
    points_value_cents: v.pointsValueCents,
    membership_required: v.membershipRequired,
    activation_required: v.activationRequired,
    coupon_required: v.couponRequired,
    min_spend: v.minSpend,
    denomination_note: text(formData, "denomination_note").trim() || null,
    format: v.format,
    source_name: v.sourceName,
    product_id: null,
    // Structured detail terms (migration 022, applied to production
    // 2026-07-12). The approve RPC persists these columns via the offer upsert.
    promo_code: v.promoCode,
    expiry_time: v.expiryTime,
    expiry_timezone: v.expiryTimezone,
    uses_per_customer: v.usesPerCustomer,
    shipping_may_apply: v.shippingMayApply,
    australia_only: v.australiaOnly,
    combinable_with_seller_promotions: v.combinableWithSellerPromotions,
    terms_url: v.termsUrl,
    included_product_ids: list(formData, "included_product_ids"),
    fixed_discount_dollars: v.fixedDiscountDollars,
    promo_credit_dollars: v.promoCreditDollars,
    fee_waiver_dollars: v.feeWaiverDollars,
    threshold_dollars: v.thresholdDollars,
    reward_destination: v.rewardDestination,
    is_ongoing: v.isOngoing,
    targeted: v.targeted,
    source_suboffer_key: v.subOfferKey,
  };

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
