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
  FEED_SOURCE_KINDS,
  getFeedSource,
  insertFeedSource,
  isFeedSourceType,
  setFeedSourceEnabled,
  updateFeedSource as persistFeedSource,
  type FeedSourceInput,
  type FeedSourceKind,
  type FeedSourceType,
} from "@/lib/admin/repos/feedSources";
import {
  isApprovedFeedUrl,
  safeHttpsUrl,
} from "@/lib/security/urlPolicy";

/**
 * Feed source admin server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the admin repo; nothing here is reachable from the public site.
 *
 * This is registration/config only — there is NO fetcher or cron, and nothing
 * here makes an external request. Feed sources are not public, so we revalidate
 * only the admin list (never /deals).
 */

export type FeedSourceFormState = { error?: string };

type ParseResult =
  | { ok: true; input: FeedSourceInput }
  | { ok: false; error: string };

/** Native checkboxes only appear in FormData when checked. */
function parseBool(formData: FormData, name: string): boolean {
  return formData.get(name) != null;
}

function parseFeedSourceForm(formData: FormData): ParseResult {
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { ok: false, error: "Label is required." };

  const kind = String(formData.get("kind") ?? "").trim();
  if (!FEED_SOURCE_KINDS.includes(kind as FeedSourceKind)) {
    return { ok: false, error: "Choose a valid kind (front, store or category)." };
  }

  const sourceType = String(formData.get("source_type") ?? "").trim();
  if (!isFeedSourceType(sourceType)) {
    return { ok: false, error: "Choose a valid source type." };
  }

  const feedUrl = String(formData.get("feed_url") ?? "").trim();
  if (!feedUrl) return { ok: false, error: "Feed URL is required." };
  const safeFeedUrl = safeHttpsUrl(feedUrl);
  if (!safeFeedUrl) {
    return { ok: false, error: "Feed URL must be a safe HTTPS URL without credentials." };
  }

  const isEnabled = parseBool(formData, "is_enabled");
  if (isEnabled && !isApprovedFeedUrl(sourceType, safeFeedUrl)) {
    return {
      ok: false,
      error: "Enabled feeds must use an approved host for their source type.",
    };
  }

  // merchant_id is optional — blank means a non-store-specific feed.
  const merchantRaw = String(formData.get("merchant_id") ?? "").trim();
  const merchantId = merchantRaw === "" ? null : merchantRaw;

  return {
    ok: true,
    input: {
      label,
      feedUrl: safeFeedUrl,
      kind: kind as FeedSourceKind,
      sourceType: sourceType as FeedSourceType,
      merchantId,
      isEnabled,
    },
  };
}

/** Friendly message for the unique feed_url constraint; otherwise generic. */
function writeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/duplicate key|unique/i.test(message)) {
    return "A feed source with that URL already exists.";
  }
  return "Could not save the feed source. Please try again.";
}

/** Feed sources are not public — only the admin list needs refreshing. */
function revalidateFeedSources(): void {
  revalidatePath("/admin/signals/sources");
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createFeedSource(
  _prev: FeedSourceFormState,
  formData: FormData
): Promise<FeedSourceFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseFeedSourceForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  let id: string;
  try {
    id = await insertFeedSource(parsed.input);
  } catch (err) {
    return { error: writeError(err) };
  }
  await logAudit({
    actorEmail: email,
    action: "create",
    tableName: "feed_sources",
    rowId: id,
    diff: {
      label: parsed.input.label,
      feedUrl: parsed.input.feedUrl,
      kind: parsed.input.kind,
      sourceType: parsed.input.sourceType,
      isEnabled: parsed.input.isEnabled,
    },
  });
  revalidateFeedSources();
  redirect("/admin/signals/sources");
}

export async function updateFeedSource(
  id: string,
  _prev: FeedSourceFormState,
  formData: FormData
): Promise<FeedSourceFormState> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const parsed = parseFeedSourceForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await persistFeedSource(id, parsed.input);
  } catch (err) {
    return { error: writeError(err) };
  }
  await logAudit({
    actorEmail: email,
    action: "update",
    tableName: "feed_sources",
    rowId: id,
    diff: {
      label: parsed.input.label,
      feedUrl: parsed.input.feedUrl,
      kind: parsed.input.kind,
      sourceType: parsed.input.sourceType,
      isEnabled: parsed.input.isEnabled,
    },
  });
  revalidateFeedSources();
  redirect("/admin/signals/sources");
}

/** Enable / disable toggle invoked from the list view (bound id + next value). */
export async function setEnabled(
  id: string,
  isEnabled: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  if (isEnabled) {
    const source = await getFeedSource(id);
    if (!source) return { error: "Feed source not found." };
    if (!isApprovedFeedUrl(source.sourceType, source.feedUrl)) {
      return { error: "This feed URL is not approved for its source type." };
    }
  }

  await setFeedSourceEnabled(id, isEnabled);
  await logAudit({
    actorEmail: email,
    action: isEnabled ? "enable" : "disable",
    tableName: "feed_sources",
    rowId: id,
    diff: { isEnabled },
  });
  revalidateFeedSources();
  return { ok: true };
}
