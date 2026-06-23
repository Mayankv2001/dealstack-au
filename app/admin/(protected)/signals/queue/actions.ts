"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
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
 * /deals here — pending signals are not public. /deals is only revalidated later
 * when the signal is approved through the existing signals CRUD. No OzBargain
 * fetching / external source calls.
 */

/** Refresh every admin surface a queue change affects (never /deals). */
function revalidateQueue(): void {
  revalidatePath("/admin/signals/queue");
  revalidatePath("/admin/signals");
  revalidatePath("/admin/dashboard");
}

/** Promote a staged item into a pending signal (idempotent, bound id). */
export async function importItem(feedItemId: string): Promise<void> {
  const { email } = await requireAdmin();
  const result = await importFeedItem(feedItemId);
  await logAudit({
    actorEmail: email,
    action: "import",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { signalId: result.signalId, created: result.created },
  });
  revalidateQueue();
}

/** Dismiss a staged item as not relevant (bound id). */
export async function ignoreItem(feedItemId: string): Promise<void> {
  const { email } = await requireAdmin();
  await setFeedItemReviewState(feedItemId, "ignored");
  await logAudit({
    actorEmail: email,
    action: "ignore",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { reviewState: "ignored" },
  });
  revalidateQueue();
}

/** Mark a staged item as already covered by an existing signal (bound id). */
export async function markDuplicate(feedItemId: string): Promise<void> {
  const { email } = await requireAdmin();
  await setFeedItemReviewState(feedItemId, "duplicate");
  await logAudit({
    actorEmail: email,
    action: "mark-duplicate",
    tableName: "feed_items",
    rowId: feedItemId,
    diff: { reviewState: "duplicate" },
  });
  revalidateQueue();
}

/**
 * Hide / show a staged item on the public homepage Top 5 (bound id + flag).
 *
 * This ONLY flips hidden_from_homepage; it never changes review_state, so the
 * item stays in this queue and remains importable — the import workflow is
 * unaffected. It is not a publish: the homepage already shows already-staged
 * items, this just curates which of them appear. We also revalidate "/" so the
 * change is reflected on the homepage promptly.
 */
async function setHomepageHidden(
  feedItemId: string,
  hidden: boolean
): Promise<void> {
  const { email } = await requireAdmin();
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
}

/** Exclude a staged item from the homepage Top 5 (keeps it in the queue). */
export async function hideFromTopDeals(feedItemId: string): Promise<void> {
  await setHomepageHidden(feedItemId, true);
}

/** Restore a previously hidden item to the homepage Top 5. */
export async function showInTopDeals(feedItemId: string): Promise<void> {
  await setHomepageHidden(feedItemId, false);
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
export async function ignoreVisibleItems(feedItemIds: string[]): Promise<void> {
  const { email } = await requireAdmin();
  const ids = [...new Set(feedItemIds)]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, BULK_IGNORE_MAX);
  if (ids.length === 0) return;

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
}
