import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type CardReportStatus = "new" | "reviewed" | "dismissed";

export interface CardOfferCorrectionReport {
  id: string;
  cardOfferId: string | null;
  offerLabel: string;
  reason: string;
  details: string;
  status: CardReportStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

interface Row {
  id: string;
  card_offer_id: string | null;
  reported_offer_label: string;
  reason: string;
  details: string;
  status: CardReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function listCardOfferCorrectionReports(): Promise<CardOfferCorrectionReport[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("card_offer_correction_reports")
    .select("id, card_offer_id, reported_offer_label, reason, details, status, reviewed_by, reviewed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`list card reports failed: ${error.message}`);
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    cardOfferId: row.card_offer_id,
    offerLabel: row.reported_offer_label,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
  }));
}

export async function setCardOfferCorrectionStatus(
  id: string,
  status: Exclude<CardReportStatus, "new">,
  reviewedBy: string
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("card_offer_correction_reports")
    .update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "new");
  if (error) throw new Error(`update card report failed: ${error.message}`);
}

