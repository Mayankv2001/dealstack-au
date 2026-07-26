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
  PROGRAMME_OPTIONS,
  insertTransferBonus,
  setTransferBonusPublished,
  updateTransferBonus as persistTransferBonus,
  type TransferBonusInput,
} from "@/lib/admin/repos/transferBonuses";
import type { Citation, Confidence } from "@/lib/sources/types";
import { normaliseSourceId } from "@/lib/sources/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Transfer-bonus admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist), then consumes one
 * admin-rate-limit unit. Service-role writes live in the repo; nothing here is
 * reachable from the public site. No external source calls — the operator
 * supplies the facts and the citation.
 */

export type TransferBonusFormState = { error?: string };

type ParseResult =
  | { ok: true; input: TransferBonusInput }
  | { ok: false; error: string };

const PROGRAMME_SLUGS = PROGRAMME_OPTIONS.map((option) => option.value);

/** Blank → null; otherwise a non-negative number. */
function parsePercent(
  raw: FormDataEntryValue | null
): { ok: true; value: number } | { ok: false } {
  const n = Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: n };
}

function parseOptionalDate(raw: FormDataEntryValue | null): string | null {
  const text = String(raw ?? "").trim();
  return text === "" ? null : text;
}

function parseForm(formData: FormData): ParseResult {
  const fromProgramme = String(formData.get("from_programme") ?? "").trim();
  const toProgramme = String(formData.get("to_programme") ?? "").trim();
  if (!PROGRAMME_SLUGS.includes(fromProgramme)) {
    return { ok: false, error: "Choose a valid source programme." };
  }
  if (!PROGRAMME_SLUGS.includes(toProgramme)) {
    return { ok: false, error: "Choose a valid destination programme." };
  }
  if (fromProgramme === toProgramme) {
    return { ok: false, error: "A transfer needs two different programmes." };
  }

  const min = parsePercent(formData.get("bonus_percent_min"));
  const max = parsePercent(formData.get("bonus_percent_max"));
  if (!min.ok || !max.ok) {
    return { ok: false, error: "Bonus percentages must be between 0 and 100." };
  }
  if (max.value < min.value) {
    return { ok: false, error: "Maximum bonus cannot be below the minimum." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  // A transfer bonus is a claim about someone else's programme, so it must
  // carry a source. The source id is recorded so the public badge names the
  // right publisher instead of defaulting to a DealStack record.
  const citations: Citation[] = [];
  const rawSourceUrl = String(formData.get("source_url") ?? "").trim();
  if (!rawSourceUrl) {
    return { ok: false, error: "A source URL is required for a transfer bonus." };
  }
  const safeSourceUrl = safeHttpsUrl(rawSourceUrl);
  if (!safeSourceUrl) {
    return {
      ok: false,
      error: "Source URL must be a safe HTTPS URL without credentials.",
    };
  }
  citations.push({
    source: normaliseSourceId(String(formData.get("source_id") ?? "")) ?? "manual",
    sourceUrl: safeSourceUrl,
  });

  const conditionsNote =
    String(formData.get("conditions_note") ?? "").trim() || null;

  return {
    ok: true,
    input: {
      fromProgramme,
      toProgramme,
      bonusPercentMin: min.value,
      bonusPercentMax: max.value,
      startsOn: parseOptionalDate(formData.get("starts_on")),
      expiryDate: parseOptionalDate(formData.get("expiry_date")),
      conditionsNote,
      citations,
      confidence: confidence as Confidence,
    },
  };
}

/** Every surface a transfer-bonus change affects. */
function revalidateTransferBonuses(): void {
  revalidatePath("/");
  revalidatePath("/rewards");
  revalidatePath("/admin/transfer-bonuses");
}

export async function createTransferBonus(
  _prev: TransferBonusFormState,
  formData: FormData
): Promise<TransferBonusFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  // Draft-first: the repo never sets is_published on insert.
  const id = await insertTransferBonus(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "points_transfer_bonuses",
    rowId: id,
    diff: {
      fromProgramme: parsed.input.fromProgramme,
      toProgramme: parsed.input.toProgramme,
      bonus: `${parsed.input.bonusPercentMin}-${parsed.input.bonusPercentMax}%`,
    },
  });
  revalidateTransferBonuses();
  redirect("/admin/transfer-bonuses");
}

export async function updateTransferBonus(
  id: string,
  _prev: TransferBonusFormState,
  formData: FormData
): Promise<TransferBonusFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistTransferBonus(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "points_transfer_bonuses",
    rowId: id,
    diff: {
      fromProgramme: parsed.input.fromProgramme,
      toProgramme: parsed.input.toProgramme,
      bonus: `${parsed.input.bonusPercentMin}-${parsed.input.bonusPercentMax}%`,
    },
  });
  revalidateTransferBonuses();
  redirect("/admin/transfer-bonuses");
}

export async function toggleTransferBonusPublished(
  id: string,
  isPublished: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setTransferBonusPublished(id, isPublished);
  await logAudit({
    actorEmail: email,
    action: isPublished ? "publish" : "unpublish",
    tableName: "points_transfer_bonuses",
    rowId: id,
    diff: { isPublished },
  });
  revalidateTransferBonuses();
  return { ok: true };
}
