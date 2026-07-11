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
  DEAL_KINDS,
  SENTIMENTS,
  SIGNAL_STATUSES,
  insertSignal,
  setSignalStatus,
  updateSignal as persistSignal,
  type Sentiment,
  type SignalInput,
  type SignalStatus,
} from "@/lib/admin/repos/signals";
import type { Confidence, DealKind } from "@/lib/sources/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * OzBargain signals admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate the public signal surfaces plus the admin list. No
 * OzBargain fetching / external source calls.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type SignalFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult =
  | { ok: true; input: SignalInput }
  | { ok: false; error: string };

/** Parses an optional non-negative number (decimals allowed). Blank → null. */
function parseOptionalAmount(
  raw: FormDataEntryValue | null
): { ok: true; value: number | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: n };
}

/** Parses an optional non-negative integer. Blank → null. */
function parseOptionalInt(
  raw: FormDataEntryValue | null
): { ok: true; value: number | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0) return { ok: false };
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

/** Optional URL field. Blank → null; non-blank must be safe public HTTPS. */
function parseOptionalUrl(
  raw: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: null };
  const url = safeHttpsUrl(text);
  return url ? { ok: true, value: url } : { ok: false };
}

/** Splits a comma/newline-separated field into a trimmed, blank-free list. */
function parseTags(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

function parseSignalForm(formData: FormData): ParseResult {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { ok: false, error: "Title is required." };

  const sentiment = String(formData.get("sentiment") ?? "").trim();
  if (!SENTIMENTS.includes(sentiment as Sentiment)) {
    return { ok: false, error: "Choose a valid sentiment." };
  }

  const dealKind = String(formData.get("deal_kind") ?? "").trim();
  if (!DEAL_KINDS.includes(dealKind as DealKind)) {
    return { ok: false, error: "Choose a valid deal kind." };
  }

  const confidence = String(formData.get("confidence") ?? "").trim();
  if (!CONFIDENCE_LEVELS.includes(confidence as Confidence)) {
    return { ok: false, error: "Choose a valid confidence level." };
  }

  const status = String(formData.get("status") ?? "").trim();
  if (!SIGNAL_STATUSES.includes(status as SignalStatus)) {
    return { ok: false, error: "Choose a valid status." };
  }

  // source_url is required and must be a real URL (the column is NOT NULL).
  const sourceUrl = String(formData.get("source_url") ?? "").trim();
  if (!sourceUrl) return { ok: false, error: "Source URL is required." };
  const safeSourceUrl = safeHttpsUrl(sourceUrl);
  if (!safeSourceUrl) {
    return { ok: false, error: "Source URL must be a safe HTTPS URL without credentials." };
  }

  const merchantUrl = parseOptionalUrl(formData.get("merchant_url"));
  if (!merchantUrl.ok) {
    return { ok: false, error: "Merchant URL must be a valid URL (including https://)." };
  }

  const productUrl = parseOptionalUrl(formData.get("product_url"));
  if (!productUrl.ok) {
    return { ok: false, error: "Product URL must be a valid URL (including https://)." };
  }

  const votesSample = parseOptionalInt(formData.get("votes_sample"));
  if (!votesSample.ok) {
    return { ok: false, error: "Votes must be a non-negative whole number." };
  }

  const commentCount = parseOptionalInt(formData.get("comment_count"));
  if (!commentCount.ok) {
    return { ok: false, error: "Comment count must be a non-negative whole number." };
  }

  const signalScore = parseOptionalAmount(formData.get("signal_score"));
  if (!signalScore.ok) {
    return { ok: false, error: "Signal score must be a non-negative number." };
  }

  // merchant_id is optional — blank means a non-merchant signal.
  const merchantRaw = String(formData.get("merchant_id") ?? "").trim();
  const merchantId = merchantRaw === "" ? null : merchantRaw;

  return {
    ok: true,
    input: {
      merchantId,
      title,
      summary: String(formData.get("summary") ?? "").trim(),
      votesSample: votesSample.value,
      commentCount: commentCount.value,
      sentiment: sentiment as Sentiment,
      dealKind: dealKind as DealKind,
      sourceUrl: safeSourceUrl,
      merchantUrl: merchantUrl.value,
      productUrl: productUrl.value,
      postedAt: parseOptionalText(formData.get("posted_at")),
      expiryDate: parseOptionalText(formData.get("expiry_date")),
      tags: parseTags(formData.get("tags")),
      promoCode: parseOptionalText(formData.get("promo_code")),
      priceText: parseOptionalText(formData.get("price_text")),
      signalScore: signalScore.value,
      confidence: confidence as Confidence,
      isSample: parseBool(formData, "is_sample"),
      status: status as SignalStatus,
    },
  };
}

/** On-demand revalidation of every surface a signal change affects. */
function revalidateSignals(): void {
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/admin/signals");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createSignal(
  _prev: SignalFormState,
  formData: FormData
): Promise<SignalFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseSignalForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const id = await insertSignal(parsed.input);
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "ozbargain_signals",
    rowId: id,
    diff: {
      title: parsed.input.title,
      status: parsed.input.status,
      isSample: parsed.input.isSample,
    },
  });
  revalidateSignals();
  redirect("/admin/signals");
}

export async function updateSignal(
  id: string,
  _prev: SignalFormState,
  formData: FormData
): Promise<SignalFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseSignalForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  await persistSignal(id, parsed.input);
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "ozbargain_signals",
    rowId: id,
    diff: {
      title: parsed.input.title,
      status: parsed.input.status,
      isSample: parsed.input.isSample,
    },
  });
  revalidateSignals();
  redirect("/admin/signals");
}

/** Status change invoked from the list view (bound id + next status). */
export async function setStatus(
  id: string,
  status: SignalStatus
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setSignalStatus(id, status);
  await logAudit({
    actorEmail: email,
    action: "status",
    tableName: "ozbargain_signals",
    rowId: id,
    diff: { status },
  });
  revalidateSignals();
  return { ok: true };
}

/** Hard cap on a single bulk-approve call — defensive against a huge payload. */
const BULK_APPROVE_MAX = 200;

/**
 * Approve a scoped set of signals in one pass — the ids the admin explicitly
 * ticked in the list (select-all minus any unticked exceptions). This IS the
 * manual review step: it uses the same per-signal status write as the per-row
 * Approve button, just batched. Per-signal failures don't abort the batch; the
 * returned error summarises what failed so the admin can retry.
 */
export async function approveSelectedSignals(
  signalIds: string[]
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  // One bulk pass counts as a single admin mutation against the limit.
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const ids = [...new Set(signalIds)]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, BULK_APPROVE_MAX);
  if (ids.length === 0) return { ok: true };

  let approved = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await setSignalStatus(id, "approved");
      approved++;
    } catch {
      failed.push(id);
    }
  }

  await logAudit({
    actorEmail: email,
    action: "status",
    tableName: "ozbargain_signals",
    rowId: null,
    // One summary row for the batch; keep a capped id list for traceability.
    diff: {
      bulk: true,
      status: "approved",
      count: ids.length,
      approved,
      failedCount: failed.length,
      ids: ids.slice(0, 50),
    },
  });
  revalidateSignals();

  if (failed.length > 0) {
    return {
      error: `Approved ${approved} of ${ids.length}; ${failed.length} failed — retry the remaining selection.`,
    };
  }
  return { ok: true };
}
