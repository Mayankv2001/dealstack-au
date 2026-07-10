"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  importFeedItem,
  setFeedItemHomepageHidden,
  setFeedItemReviewState,
} from "@/lib/admin/repos/feedQueue";

/**
 * Feed import queue server actions.
 *
 * SECURITY: every action calls requireAdmin() first (a valid session is not
 * enough — the email must be in the admins allowlist). The service-role writes
 * live in the feed-queue repo; nothing here is reachable from the public site.
 *
 * Importing creates a PENDING signal, so we deliberately do NOT revalidate
 * public routes here. They are revalidated later when the signal is approved
 * through the existing signals CRUD. No OzBargain fetching / external source
 * calls.
 */

/** Refresh every admin surface a queue change affects (never /deals). */
function revalidateQueue(): void {
  revalidatePath("/admin/signals/queue");
  revalidatePath("/admin/signals");
  revalidatePath("/admin/dashboard");
}

/** Promote a staged item into a pending signal (idempotent, bound id). */
export async function importItem(
  feedItemId: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const result = await importFeedItem(feedItemId);
  await logAudit({
    actorEmail: email,
    action: "import",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { signalId: result.signalId, created: result.created },
  });
  revalidateQueue();
  return { ok: true };
}

/** Dismiss a staged item as not relevant (bound id). */
export async function ignoreItem(
  feedItemId: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setFeedItemReviewState(feedItemId, "ignored");
  await logAudit({
    actorEmail: email,
    action: "ignore",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { reviewState: "ignored" },
  });
  revalidateQueue();
  return { ok: true };
}

/** Mark a staged item as already covered by an existing signal (bound id). */
export async function markDuplicate(
  feedItemId: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setFeedItemReviewState(feedItemId, "duplicate");
  await logAudit({
    actorEmail: email,
    action: "mark-duplicate",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { reviewState: "duplicate" },
  });
  revalidateQueue();
  return { ok: true };
}

/**
 * Hide / show a staged item on the public homepage Top 5 (bound id + flag).
 *
 * This ONLY flips hidden_from_homepage; it never changes review_state, so the
 * item stays in this queue and remains importable — the import workflow is
 * unaffected. It is not a publish: the homepage Top 5 requires both an imported
 * item and an approved promoted signal; this flag is an additional curation
 * veto. We also revalidate "/" so the change is reflected promptly.
 */
async function setHomepageHidden(
  feedItemId: string,
  hidden: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  await setFeedItemHomepageHidden(feedItemId, hidden);
  await logAudit({
    actorEmail: email,
    action: hidden ? "hide-from-homepage" : "show-on-homepage",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { hiddenFromHomepage: hidden },
  });
  revalidateQueue();
  // Reflect the curation on the public homepage Top 5 (not a publish).
  revalidatePath("/");
  return { ok: true };
}

/** Exclude a staged item from the homepage Top 5 (keeps it in the queue). */
export async function hideFromTopDeals(
  feedItemId: string
): Promise<AdminActionResult> {
  return setHomepageHidden(feedItemId, true);
}

/** Restore a previously hidden item to the homepage Top 5. */
export async function showInTopDeals(
  feedItemId: string
): Promise<AdminActionResult> {
  return setHomepageHidden(feedItemId, false);
}

/** Hard cap on a single bulk-ignore call — defensive against a huge payload. */
const BULK_IGNORE_MAX = 200;

/**
 * Ignore a scoped set of items in one pass — the IDs the admin can currently see
 * after filtering. Uses the SAME per-item review-state write as `ignoreItem`
 * (review_state = 'ignored'); it never imports, never approves, and never touches
 * ozbargain_signals. The caller passes only the visible/filtered ids, and the set
 * is deduped and capped here as a backstop.
 */
export async function ignoreVisibleItems(
  feedItemIds: string[]
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  // One bulk pass counts as a single admin mutation against the limit.
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const ids = [...new Set(feedItemIds)]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, BULK_IGNORE_MAX);
  if (ids.length === 0) return { ok: true };

  for (const id of ids) {
    await setFeedItemReviewState(id, "ignored");
  }
  await logAudit({
    actorEmail: email,
    action: "ignore",
    tableName: "feed_items",
    rowId: null,
    // One summary row for the batch; keep a capped id list for traceability.
    diff: { bulk: true, count: ids.length, ids: ids.slice(0, 50) },
  });
  revalidateQueue();
  return { ok: true };
}
