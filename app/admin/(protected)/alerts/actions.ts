"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit, type AdminActionResult } from "@/lib/admin/rate-limit";
import { adminUnsubscribeEmailAlert } from "@/lib/admin/repos/emailAlerts";
import { logAudit } from "@/lib/admin/repos/audit";

export async function unsubscribeAlert(id: string): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const rate = await checkAdminRateLimit({ adminEmail: email });
  if (!rate.success) return { error: rate.error };
  try {
    await adminUnsubscribeEmailAlert(id);
    await logAudit({ actorEmail: email, action: "unsubscribe", tableName: "email_alert_subscriptions", rowId: id });
    revalidatePath("/admin/alerts");
    return { ok: true };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not unsubscribe this alert." };
  }
}
