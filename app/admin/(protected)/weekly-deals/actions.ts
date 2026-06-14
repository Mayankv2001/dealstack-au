"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  CONFIDENCE_LEVELS,
  WEEKLY_HIGHLIGHTS,
  insertWeeklyDeal,
  setWeeklyDealPublished,
  updateWeeklyDeal as persistWeeklyDeal,
  type WeeklyDealInput,
} from "@/lib/admin/repos/weeklyDeals";
import type { WeeklyHighlight } from "@/lib/offers/types";
import type { Citation, Confidence } from "@/lib/sources/types";

/**
 * Weekly-deals admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate /deals so the published view reflects it, plus the
 * admin list. No external source calls.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type WeeklyDealFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: WeeklyDealInput }
  | { ok: false; error: string };

/** Native checkboxes only appear in FormData when checked. */
function parseBool(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

/** Splits a newline-separated textarea into a trimmed, blank-free list. */
function parseLines(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function parseWeeklyDealForm(formData: FormData): ParseResult {
  const weekOf = String(formData.get("week_of") ?? "").trim();
  if (!weekOf) return { ok: false, error: "Week of (date) is required." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };

  const highlight = String(formData.get("highlight") ?? "").trim();
  if (!WEEKLY_HIGHLIGHTS.includes(highlight as WeeklyHighlight)) {
    return { ok: false, error: "Choose a valid highlight." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  // merchant_id is optional — blank means a non-merchant / program-wide deal.
  const merchantRaw = String(formData.get("merchant_id") ?? "").trim();
  const merchantId = merchantRaw === "" ? null : merchantRaw;

  const expiryRaw = String(formData.get("expiry_date") ?? "").trim();
  const expiryDate = expiryRaw === "" ? null : expiryRaw;

  // A single source URL is stored as a manual citation (matches the other admin
  // editors and what the public site renders). Blank → no citation.
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
      weekOf,
      merchantId,
      title,
      summary: String(formData.get("summary") ?? "").trim(),
      highlight: highlight as WeeklyHighlight,
      componentIds: parseLines(formData.get("component_ids")),
      expiryDate,
      confidence: confidence as Confidence,
      citations,
      isPublished: parseBool(formData, "is_published"),
    },
  };
}

/** On-demand revalidation of every surface a weekly-deal change affects. */
function revalidateWeeklyDeals(): void {
  revalidatePath("/deals");
  revalidatePath("/admin/weekly-deals");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createWeeklyDeal(
  _prev: WeeklyDealFormState,
  formData: FormData
): Promise<WeeklyDealFormState> {
  await requireAdmin();

  const parsed = parseWeeklyDealForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await insertWeeklyDeal(parsed.input);
  revalidateWeeklyDeals();
  redirect("/admin/weekly-deals");
}

export async function updateWeeklyDeal(
  id: string,
  _prev: WeeklyDealFormState,
  formData: FormData
): Promise<WeeklyDealFormState> {
  await requireAdmin();

  const parsed = parseWeeklyDealForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistWeeklyDeal(id, parsed.input);
  revalidateWeeklyDeals();
  redirect("/admin/weekly-deals");
}

/** Publish / unpublish toggle invoked from the list view (bound id + next value). */
export async function setPublished(
  id: string,
  isPublished: boolean
): Promise<void> {
  await requireAdmin();
  await setWeeklyDealPublished(id, isPublished);
  revalidateWeeklyDeals();
}
