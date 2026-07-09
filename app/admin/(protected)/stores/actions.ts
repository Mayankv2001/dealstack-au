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
  CASHBACK_PROVIDERS,
  STORE_ID_PATTERN,
  StoreIdConflictError,
  insertStore,
  setStorePublished,
  updateStore as persistStore,
  type StoreInput,
} from "@/lib/admin/repos/stores";
import type { CashbackProvider, StoreLogoTheme } from "@/lib/data";

/**
 * Store admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site. After
 * any change we revalidate the admin list AND the public surfaces store data
 * feeds. No external source calls: manual entry only; nothing publishes without
 * the admin's explicit flag/toggle.
 *
 * The store id is immutable: create validates and supplies it, update takes it
 * from the route param only. There is no delete action — unpublish is the whole
 * lifecycle.
 */

/** Returned to the form via useActionState. Empty object means "no error yet". */
export type StoreFormState = { error?: string };

// ── Parsing / validation ─────────────────────────────────────────────────────

type ParseResult = { ok: true; input: StoreInput } | { ok: false; error: string };

/** Required percent field (DB column is NOT NULL, default 0). Blank → 0; 0–100. */
function parsePercent(
  raw: FormDataEntryValue | null
): { ok: true; value: number } | { ok: false } {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, value: 0 };
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: n };
}

/** Native checkboxes only appear in FormData when checked. */
function parseBool(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

/** Trimmed free-text; blank stays "" (these columns are NOT NULL with a default). */
function text(raw: FormDataEntryValue | null): string {
  return String(raw ?? "").trim();
}

/** Optional free-text field. Blank → null. */
function optionalText(raw: FormDataEntryValue | null): string | null {
  const t = String(raw ?? "").trim();
  return t === "" ? null : t;
}

/**
 * Aliases: one per line, trimmed, lowercased, empties dropped, de-duplicated.
 * Stored lowercased so they line up with lib/sources/normalise.ts matching
 * (findMerchantIdInText normalises to lowercase before comparing).
 */
function parseAliases(raw: FormDataEntryValue | null): string[] {
  const seen = new Set<string>();
  for (const line of String(raw ?? "").split("\n")) {
    const alias = line.trim().toLowerCase();
    if (alias !== "") seen.add(alias);
  }
  return [...seen];
}

/**
 * Optional date field. Blank → null; otherwise a real calendar date in
 * YYYY-MM-DD form (what <input type="date"> submits and the `date` column
 * expects) — validated here so a malformed value becomes a friendly form error
 * instead of a Postgres error. Mirrors the other admin forms.
 */
function parseOptionalDate(
  raw: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: true, value: null };
  const match = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false };
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const isRealDate =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d;
  return isRealDate ? { ok: true, value: t } : { ok: false };
}

/**
 * Optional jsonb theme: blank → null; otherwise valid JSON. Never writes the
 * literal string "{}" — a real object or null only. Invalid JSON is a friendly
 * error, not a 500.
 */
function parseLogoTheme(
  raw: FormDataEntryValue | null
): { ok: true; value: StoreLogoTheme | null } | { ok: false } {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: true, value: null };
  try {
    const parsed = JSON.parse(t);
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false };
    }
    return { ok: true, value: parsed as StoreLogoTheme };
  } catch {
    return { ok: false };
  }
}

/** Integer sort order. Blank → 0. */
function parseSortOrder(
  raw: FormDataEntryValue | null
): { ok: true; value: number } | { ok: false } {
  const t = String(raw ?? "").trim();
  if (t === "") return { ok: true, value: 0 };
  const n = Number(t);
  if (!Number.isInteger(n)) return { ok: false };
  return { ok: true, value: n };
}

/** Parses every editable field EXCEPT the id (which the caller owns). */
function parseStoreForm(formData: FormData): ParseResult {
  const name = text(formData.get("name"));
  if (!name) return { ok: false, error: "Name is required." };

  const category = text(formData.get("category"));
  if (!category) return { ok: false, error: "Category is required." };

  const logo = text(formData.get("logo"));
  if (!logo) return { ok: false, error: "Logo (initials/placeholder) is required." };

  const provider = text(formData.get("cashback_provider"));
  if (!CASHBACK_PROVIDERS.includes(provider as CashbackProvider)) {
    return { ok: false, error: "Choose a valid cashback provider." };
  }

  const discountPercent = parsePercent(formData.get("discount_percent"));
  if (!discountPercent.ok) {
    return { ok: false, error: "Discount % must be a number between 0 and 100." };
  }

  const cashbackPercent = parsePercent(formData.get("cashback_percent"));
  if (!cashbackPercent.ok) {
    return { ok: false, error: "Cashback % must be a number between 0 and 100." };
  }

  const giftCardDiscountPercent = parsePercent(
    formData.get("gift_card_discount_percent")
  );
  if (!giftCardDiscountPercent.ok) {
    return {
      ok: false,
      error: "Gift card discount % must be a number between 0 and 100.",
    };
  }

  const sortOrder = parseSortOrder(formData.get("sort_order"));
  if (!sortOrder.ok) {
    return { ok: false, error: "Sort order must be a whole number." };
  }

  const expiryDate = parseOptionalDate(formData.get("expiry_date"));
  if (!expiryDate.ok) {
    return {
      ok: false,
      error: "Expiry date must be a real date in YYYY-MM-DD format (or blank).",
    };
  }

  const logoTheme = parseLogoTheme(formData.get("logo_theme"));
  if (!logoTheme.ok) {
    return {
      ok: false,
      error: "Logo theme must be a valid JSON object (or blank).",
    };
  }

  return {
    ok: true,
    input: {
      name,
      category,
      logo,
      logoPath: optionalText(formData.get("logo_path")),
      logoText: optionalText(formData.get("logo_text")),
      logoSubtext: optionalText(formData.get("logo_subtext")),
      logoTheme: logoTheme.value,
      discountPercent: discountPercent.value,
      discountCode: text(formData.get("discount_code")),
      expiryDate: expiryDate.value,
      cashbackPercent: cashbackPercent.value,
      cashbackProvider: provider as CashbackProvider,
      giftCardDiscountPercent: giftCardDiscountPercent.value,
      giftCardSource: text(formData.get("gift_card_source")),
      pointsProgram: text(formData.get("points_program")),
      pointsRate: text(formData.get("points_rate")),
      aliases: parseAliases(formData.get("aliases")),
      isPublished: parseBool(formData, "is_published"),
      sortOrder: sortOrder.value,
    },
  };
}

/**
 * On-demand revalidation of every public surface a store change affects — the
 * homepage store grid, /deals, /search and the store's own page — plus the admin
 * list. RLS keeps unpublished stores out of the public reads either way.
 */
function revalidateStores(id: string): void {
  revalidatePath("/admin/stores");
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/search");
  revalidatePath(`/stores/${id}`);
}

/** Friendly message for a failed repo write (details stay in server logs). */
function writeFailed(err: unknown, verb: string): string {
  console.error(`[admin/stores] ${verb} failed:`, err);
  return `Could not ${verb} this store — please try again.`;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createStore(
  _prev: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  // The id is admin-supplied and permanent — validate its shape up front.
  const id = text(formData.get("id")).toLowerCase();
  if (!STORE_ID_PATTERN.test(id)) {
    return {
      error:
        "Store id must be 2–40 characters of lowercase letters, numbers and hyphens (e.g. jb-hifi).",
    };
  }

  const parsed = parseStoreForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await insertStore(id, parsed.input);
  } catch (err) {
    if (err instanceof StoreIdConflictError) {
      return { error: "A store with this id already exists." };
    }
    return { error: writeFailed(err, "create") };
  }
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "stores",
    rowId: id,
    diff: {
      name: parsed.input.name,
      category: parsed.input.category,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateStores(id);
  redirect("/admin/stores");
}

export async function updateStore(
  id: string,
  _prev: StoreFormState,
  formData: FormData
): Promise<StoreFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseStoreForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  // id comes from the route param only — never from the form — so it is immutable.
  try {
    await persistStore(id, parsed.input);
  } catch (err) {
    return { error: writeFailed(err, "update") };
  }
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "stores",
    rowId: id,
    diff: {
      name: parsed.input.name,
      category: parsed.input.category,
      isPublished: parsed.input.isPublished,
    },
  });
  revalidateStores(id);
  redirect("/admin/stores");
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
    await setStorePublished(id, isPublished);
  } catch (err) {
    return { error: writeFailed(err, isPublished ? "publish" : "unpublish") };
  }
  await logAudit({
    actorEmail: email,
    action: isPublished ? "publish" : "unpublish",
    tableName: "stores",
    rowId: id,
    diff: { isPublished },
  });
  revalidateStores(id);
  return { ok: true };
}
