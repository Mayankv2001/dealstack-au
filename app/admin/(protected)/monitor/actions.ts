"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import { disableAllFeedSources } from "@/lib/admin/repos/feedSources";

/** Disable all feed sources without touching staged or public data. */
export async function disableAllFeeds(): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  let disabledCount: number;
  try {
    disabledCount = await disableAllFeedSources();
  } catch {
    return { error: "Could not disable feed sources. Please try again." };
  }

  await logAudit({
    actorEmail: email,
    action: "monitor-disable-all-feeds",
    tableName: "feed_sources",
    rowId: null,
    diff: { disabledCount },
  });
  revalidatePath("/admin/monitor");
  revalidatePath("/admin/signals/sources");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
