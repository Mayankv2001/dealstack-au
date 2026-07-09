"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit } from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  applyOfferChange,
  setOfferChangeReviewState,
} from "@/lib/admin/repos/offerChanges";
import { ozbOfferDetectEnabled } from "@/lib/env";
import type { OfferChangeCandidateInsert } from "@/lib/monitor/offerChanges";

/**
 * Offer-change review server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the offer-changes repo; nothing here is reachable from the public site.
 *
 * Apply is the ONLY action that mutates a published offer, and only for a
 * candidate still in review with a resolved target (enforced in the repo via the
 * pure planner). Ignore / Mark duplicate touch ONLY the staging row, so they can
 * never change public data — which is why they do NOT revalidate public pages.
 * No scraping / fetching / external calls here.
 */

export type OfferChangeActionResult = { ok: true } | { error: string };

/** Admin surfaces a queue change affects (never public pages). */
function revalidateAdmin(): void {
  revalidatePath("/admin/offer-changes");
  revalidatePath("/admin/dashboard");
}

/** Applying changes a PUBLISHED offer, so the public surfaces must refresh. */
function revalidatePublicOffers(merchantId: string | null): void {
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/search");
  if (merchantId) revalidatePath(`/stores/${merchantId}`);
}

/** Apply a reviewed candidate to its target offer (admin-confirmed). */
export async function applyOfferChangeAction(
  id: string
): Promise<OfferChangeActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  try {
    const result = await applyOfferChange(id, email);
    await logAudit({
      actorEmail: email,
      action: "apply",
      tableName: "offer_change_candidates",
      rowId: id,
      diff: { applied: result },
    });
    revalidateAdmin();
    revalidatePublicOffers(result.merchantId);
    return { ok: true };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not apply this change.",
    };
  }
}

/** Dismiss a candidate as not relevant — staging only, no public change. */
export async function ignoreOfferChangeAction(
  id: string
): Promise<OfferChangeActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  try {
    await setOfferChangeReviewState(id, "ignored", email);
    await logAudit({
      actorEmail: email,
      action: "ignore",
      tableName: "offer_change_candidates",
      rowId: id,
      diff: { reviewState: "ignored" },
    });
    revalidateAdmin();
    return { ok: true };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not ignore this change.",
    };
  }
}

export type DetectionPreviewResult =
  | {
      ok: true;
      flagEnabled: boolean;
      scanned: number;
      detected: number;
      deduped: number;
      candidates: OfferChangeCandidateInsert[];
    }
  | { error: string };

/**
 * Read-only preview of what detection WOULD stage — for reviewing precision
 * before flipping OZB_OFFER_DETECT_ENABLED. Deliberately does NOT gate on the
 * flag (the flag gates the write hooks; this exists precisely for pre-enable
 * review) and does NOT consume the admin rate limiter (that budget is for
 * mutations — a read here must never starve real Apply/Ignore actions; the
 * client debounces instead via a pending transition). Nothing is written and
 * nothing is logged, since nothing changed.
 */
export async function previewDetectionAction(): Promise<DetectionPreviewResult> {
  await requireAdmin();
  try {
    const { runDetection } = await import("@/lib/monitor/runDetection");
    const { createDetectionPersistence } = await import(
      "@/lib/admin/repos/offerChanges"
    );
    const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const summary = await runDetection(createDetectionPersistence(), {
      sinceIso,
      dryRun: true,
      includeCandidates: true,
    });
    return {
      ok: true,
      flagEnabled: ozbOfferDetectEnabled(),
      scanned: summary.scanned,
      detected: summary.detected,
      deduped: summary.deduped,
      candidates: summary.candidates ?? [],
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Preview failed." };
  }
}

/** Mark a candidate as already covered — staging only, no public change. */
export async function markDuplicateOfferChangeAction(
  id: string
): Promise<OfferChangeActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  try {
    await setOfferChangeReviewState(id, "duplicate", email);
    await logAudit({
      actorEmail: email,
      action: "mark-duplicate",
      tableName: "offer_change_candidates",
      rowId: id,
      diff: { reviewState: "duplicate" },
    });
    revalidateAdmin();
    return { ok: true };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not mark this duplicate.",
    };
  }
}
