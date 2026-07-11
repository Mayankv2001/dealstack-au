"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import {
  approveFeedItem,
  rejectFeedItem,
  restoreFeedItem,
  setFeedItemHomepageHidden,
  type FeedApprovalOverrides,
} from "@/lib/admin/repos/feedQueue";

const BULK_REVIEW_MAX = 200;

function revalidateQueue(publicChanged = false): void {
  revalidatePath("/admin/signals/queue");
  revalidatePath("/admin/review");
  revalidatePath("/admin/signals");
  revalidatePath("/admin/dashboard");
  if (publicChanged) {
    revalidatePath("/");
    revalidatePath("/deals");
    revalidatePath("/search");
  }
}

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids)]
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, BULK_REVIEW_MAX);
}

/** Human approval publishes one reviewed item directly and atomically. */
export async function approveItem(
  feedItemId: string,
  overrides: FeedApprovalOverrides = {}
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };
  try {
    await approveFeedItem(feedItemId, overrides);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not approve this deal.",
    };
  }
  revalidateQueue(true);
  return { ok: true };
}

/** Reject means archive in the private feed ledger, never physical deletion. */
export async function rejectItem(
  feedItemId: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  try {
    await rejectFeedItem(feedItemId, email);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not reject this deal.",
    };
  }
  revalidateQueue();
  return { ok: true };
}

export async function restoreItem(
  feedItemId: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  try {
    await restoreFeedItem(feedItemId);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not restore this deal.",
    };
  }
  revalidateQueue();
  return { ok: true };
}

export async function approveSelectedItems(
  feedItemIds: string[]
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const ids = cleanIds(feedItemIds);
  if (ids.length === 0) return { ok: true };
  let approved = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await approveFeedItem(id);
      approved++;
    } catch {
      failed.push(id);
    }
  }
  revalidateQueue(approved > 0);
  return failed.length === 0
    ? { ok: true }
    : {
        error: `Approved ${approved} of ${ids.length}; ${failed.length} failed and remain in the queue.`,
      };
}

export async function rejectSelectedItems(
  feedItemIds: string[]
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const ids = cleanIds(feedItemIds);
  if (ids.length === 0) return { ok: true };
  let rejected = 0;
  const failed: string[] = [];
  for (const id of ids) {
    try {
      await rejectFeedItem(id, email);
      rejected++;
    } catch {
      failed.push(id);
    }
  }
  revalidateQueue();
  return failed.length === 0
    ? { ok: true }
    : {
        error: `Rejected ${rejected} of ${ids.length}; ${failed.length} failed and remain in the queue.`,
      };
}

async function setHomepageHidden(
  feedItemId: string,
  hidden: boolean
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };
  await setFeedItemHomepageHidden(feedItemId, hidden);
  revalidateQueue(true);
  return { ok: true };
}

export async function hideFromTopDeals(
  feedItemId: string
): Promise<AdminActionResult> {
  return setHomepageHidden(feedItemId, true);
}

export async function showInTopDeals(
  feedItemId: string
): Promise<AdminActionResult> {
  return setHomepageHidden(feedItemId, false);
}
