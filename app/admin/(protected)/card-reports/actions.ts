"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { checkAdminRateLimit, type AdminActionResult } from "@/lib/admin/rate-limit";
import { setCardOfferCorrectionStatus, type CardReportStatus } from "@/lib/admin/repos/cardReports";

export async function resolveCardReport(
  id: string,
  status: Exclude<CardReportStatus, "new">
): Promise<AdminActionResult> {
  const { email } = await requireAdmin();
  const limit = await checkAdminRateLimit({ adminEmail: email });
  if (!limit.success) return { error: limit.error };
  if (status !== "reviewed" && status !== "dismissed") {
    return { error: "Invalid report status." };
  }
  try {
    await setCardOfferCorrectionStatus(id, status, email);
    revalidatePath("/admin/card-reports");
    return { ok: true };
  } catch {
    return { error: "Could not update this report." };
  }
}

