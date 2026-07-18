"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  insertComplianceReview,
  updateComplianceReview as persistComplianceReview,
  type ComplianceReviewInput,
} from "@/lib/admin/repos/compliance";

/**
 * Compliance review admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site.
 *
 * Record-keeping only — nothing here makes an external request. The reviewer
 * email is taken from the signed-in admin, and
 * reviewed_at is stamped when a review is saved as approved.
 */

export type ComplianceReviewFormState = { error?: string };

type ParseResult =
  | { ok: true; input: ComplianceReviewInput }
  | { ok: false; error: string };

/** Native checkboxes only appear in FormData when checked. */
function parseBool(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

function parseReviewForm(
  formData: FormData,
  reviewerEmail: string
): ParseResult {
  const sourceName = String(formData.get("source_name") ?? "").trim();
  if (!sourceName) return { ok: false, error: "Source name is required." };

  const notesRaw = String(formData.get("notes") ?? "").trim();
  const approvedForMonitoring = parseBool(formData, "approved_for_monitoring");

  return {
    ok: true,
    input: {
      sourceName,
      robotsTxtChecked: parseBool(formData, "robots_txt_checked"),
      termsChecked: parseBool(formData, "terms_checked"),
      feedPathsAllowed: parseBool(formData, "feed_paths_allowed"),
      userAgentRecorded: parseBool(formData, "user_agent_recorded"),
      rateLimitRecorded: parseBool(formData, "rate_limit_recorded"),
      approvedForMonitoring,
      reviewerEmail,
      notes: notesRaw === "" ? null : notesRaw,
      // Stamp the approval time only when the review is saved as approved.
      reviewedAt: approvedForMonitoring ? new Date().toISOString() : null,
    },
  };
}

function revalidateCompliance(): void {
  revalidatePath("/admin/compliance");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createReview(
  _prev: ComplianceReviewFormState,
  formData: FormData
): Promise<ComplianceReviewFormState> {
  const { email } = await requireAdmin();

  const parsed = parseReviewForm(formData, email);
  if (!parsed.ok) return { error: parsed.error };

  const reviewId = await insertComplianceReview(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "compliance_reviews",
    rowId: reviewId,
    diff: {
      sourceName: parsed.input.sourceName,
      approvedForMonitoring: parsed.input.approvedForMonitoring,
    },
  });
  revalidateCompliance();
  redirect("/admin/compliance");
}

export async function updateReview(
  id: string,
  _prev: ComplianceReviewFormState,
  formData: FormData
): Promise<ComplianceReviewFormState> {
  const { email } = await requireAdmin();

  const parsed = parseReviewForm(formData, email);
  if (!parsed.ok) return { error: parsed.error };

  await persistComplianceReview(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "compliance_reviews",
    rowId: id,
    diff: {
      sourceName: parsed.input.sourceName,
      approvedForMonitoring: parsed.input.approvedForMonitoring,
    },
  });
  revalidateCompliance();
  redirect("/admin/compliance");
}
