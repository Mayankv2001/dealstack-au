"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  importFeedItem,
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
  await requireAdmin();
  await importFeedItem(feedItemId);
  revalidateQueue();
}

/** Dismiss a staged item as not relevant (bound id). */
export async function ignoreItem(feedItemId: string): Promise<void> {
  await requireAdmin();
  await setFeedItemReviewState(feedItemId, "ignored");
  revalidateQueue();
}

/** Mark a staged item as already covered by an existing signal (bound id). */
export async function markDuplicate(feedItemId: string): Promise<void> {
  await requireAdmin();
  await setFeedItemReviewState(feedItemId, "duplicate");
  revalidateQueue();
}
