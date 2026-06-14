"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  CONFIDENCE_LEVELS,
  POINTS_MECHANISMS,
  insertPointsOffer,
  setPointsPublished,
  updatePointsOffer as persistPointsOffer,
  type PointsMechanism,
  type PointsOfferInput,
} from "@/lib/admin/repos/points";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Points admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate /deals so the published view reflects it, plus the
 * admin list. No external source calls.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type PointsFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: PointsOfferInput }
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

function parsePointsForm(formData: FormData): ParseResult {
  const program = String(formData.get("program") ?? "").trim();
  if (!program) return { ok: false, error: "Program is required." };

  const mechanism = String(formData.get("mechanism") ?? "").trim();
  if (!POINTS_MECHANISMS.includes(mechanism as PointsMechanism)) {
    return { ok: false, error: "Choose a valid mechanism." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  // merchant_id is optional — blank means a program-wide offer.
  const merchantRaw = String(formData.get("merchant_id") ?? "").trim();
  const merchantId = merchantRaw === "" ? null : merchantRaw;

  const earnMultiple = parseOptionalAmount(formData.get("earn_multiple"));
  if (!earnMultiple.ok) {
    return { ok: false, error: "Earn multiple must be a non-negative number." };
  }

  const pointValueCents = parseOptionalAmount(formData.get("point_value_cents"));
  if (!pointValueCents.ok) {
    return { ok: false, error: "Point value (cents) must be a non-negative number." };
  }

  const expiryRaw = String(formData.get("expiry_date") ?? "").trim();
  const expiryDate = expiryRaw === "" ? null : expiryRaw;

  // A single source URL is stored as a manual citation (matches the cashback /
  // gift-card admins and what the public site renders). Blank → no citation.
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  const citations: Citation[] = [];
  if (sourceUrl !== "") {
    if (!URL.canParse(sourceUrl)) {
      return { ok: false, error: "Source URL must be a valid URL (including https://)." };
    }
    citations.push({ source: "manual", sourceUrl });
  }

  return {
    ok: true,
    input: {
      merchantId,
      program,
      earnRateDisplay: String(formData.get("earn_rate_display") ?? "").trim(),
      earnMultiple: earnMultiple.value,
      pointValueCents: pointValueCents.value,
      mechanism: mechanism as PointsMechanism,
      expiryDate,
      confidence: confidence as Confidence,
      citations,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/** On-demand revalidation of every surface a points change affects. */
function revalidatePoints(): void {
  revalidatePath("/deals");
  revalidatePath("/admin/points");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createPointsOffer(
  _prev: PointsFormState,
  formData: FormData
): Promise<PointsFormState> {
  await requireAdmin();

  const parsed = parsePointsForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await insertPointsOffer(parsed.input);
  revalidatePoints();
  redirect("/admin/points");
}

export async function updatePointsOffer(
  id: string,
  _prev: PointsFormState,
  formData: FormData
): Promise<PointsFormState> {
  await requireAdmin();

  const parsed = parsePointsForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistPointsOffer(id, parsed.input);
  revalidatePoints();
  redirect("/admin/points");
}

/** Publish / unpublish toggle invoked from the list view (bound id + next value). */
export async function setPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  await requireAdmin();
  await setPointsPublished(id, isPublished);
  revalidatePoints();
}
