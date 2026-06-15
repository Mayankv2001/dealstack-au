"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  FEED_SOURCE_KINDS,
  insertFeedSource,
  setFeedSourceEnabled,
  updateFeedSource as persistFeedSource,
  type FeedSourceInput,
  type FeedSourceKind,
} from "@/lib/admin/repos/feedSources";

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

  const feedUrl = String(formData.get("feed_url") ?? "").trim();
  if (!feedUrl) return { ok: false, error: "Feed URL is required." };
  if (!URL.canParse(feedUrl)) {
    return { ok: false, error: "Feed URL must be a valid URL (including https://)." };
  }

  const kind = String(formData.get("kind") ?? "").trim();
  if (!FEED_SOURCE_KINDS.includes(kind as FeedSourceKind)) {
    return { ok: false, error: "Choose a valid kind (front, store or category)." };
  }

  // merchant_id is optional — blank means a non-store-specific feed.
  const merchantRaw = String(formData.get("merchant_id") ?? "").trim();
  const merchantId = merchantRaw === "" ? null : merchantRaw;

  return {
    ok: true,
    input: {
      label,
      feedUrl,
      kind: kind as FeedSourceKind,
      merchantId,
      isEnabled: parseBool(formData, "is_enabled"),
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
  await requireAdmin();

  const parsed = parseFeedSourceForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await insertFeedSource(parsed.input);
  } catch (err) {
    return { error: writeError(err) };
  }
  revalidateFeedSources();
  redirect("/admin/signals/sources");
}

export async function updateFeedSource(
  id: string,
  _prev: FeedSourceFormState,
  formData: FormData
): Promise<FeedSourceFormState> {
  await requireAdmin();

  const parsed = parseFeedSourceForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  try {
    await persistFeedSource(id, parsed.input);
  } catch (err) {
    return { error: writeError(err) };
  }
  revalidateFeedSources();
  redirect("/admin/signals/sources");
}

/** Enable / disable toggle invoked from the list view (bound id + next value). */
export async function setEnabled(id: string, isEnabled: boolean): Promise<void> {
  await requireAdmin();
  await setFeedSourceEnabled(id, isEnabled);
  revalidateFeedSources();
}
