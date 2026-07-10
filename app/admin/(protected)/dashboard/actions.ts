"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import {
  checkAdminRateLimit,
  type AdminActionResult,
} from "@/lib/admin/rate-limit";
import { logAudit } from "@/lib/admin/repos/audit";
import {
  recheckTableFor,
  touchLastCheckedAt,
  type RecheckableType,
} from "@/lib/admin/repos/recheck";

/**
 * Dashboard server actions.
 *
 * SECURITY: requireAdmin() first (a valid session is not enough — the email
 * must be in the admins allowlist), then one rate-limit unit. The service-role
 * write lives in the recheck repo; nothing here is reachable from the public
 * site. `markRechecked` bumps ONLY `last_checked_at` — it changes no offer
 * value and publishes nothing. No external source calls.
 */

/**
 * Mark one data-quality-flagged row as re-checked now (clears the `stale` flag).
 * `type` comes back from the client as an arbitrary string, so the table is
 * resolved through the recheck allow-list — never from the raw input.
 */
export async function markRechecked(
  type: string,
  id: string
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();

  const rateLimit = await checkAdminRateLimit({ adminEmail: email });
  if (!rateLimit.success) return { error: rateLimit.error };

  const table = recheckTableFor(type);
  if (!table) {
    return { error: "This item type can't be marked re-checked." };
  }
  if (typeof id !== "string" || id.trim() === "" || id.length > 200) {
    return { error: "Invalid row reference." };
  }

  try {
    await touchLastCheckedAt(type as RecheckableType, id);
  } catch (err) {
    console.error("[admin/dashboard] mark-rechecked failed:", err);
    return { error: "Could not mark this item re-checked — please try again." };
  }

  await logAudit({
    actorEmail: email,
    action: "mark-rechecked",
    tableName: table,
    rowId: id,
    diff: { last_checked_at: "now" },
  });
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
