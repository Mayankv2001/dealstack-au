import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { throwGiftCardJobRunRepoError } from "./giftCardJobRunErrors";

export type GiftCardRunKind = "ingest" | "reconcile" | "activate-archive";

interface AcquireGiftCardJobRunOptions {
  sourceId: string;
  runKind: GiftCardRunKind;
  startedAt: Date;
  staleAfterMinutes: number;
}

/**
 * Migration-030 transactional lease acquisition. The database, not a client
 * read/update race, decides whether an expired lease can be recovered.
 */
export async function acquireGiftCardJobRun({
  sourceId,
  runKind,
  startedAt,
  staleAfterMinutes,
}: AcquireGiftCardJobRunOptions): Promise<string | null> {
  if (!Number.isFinite(staleAfterMinutes) || staleAfterMinutes <= 0 || staleAfterMinutes > 60) {
    throw new Error("Gift-card job staleAfterMinutes must be between 1 and 60.");
  }
  const leaseExpiresAt = new Date(
    startedAt.getTime() + staleAfterMinutes * 60_000,
  );
  const result = await getSupabaseAdmin().rpc(
    "acquire_gift_card_job_run" as never,
    {
      p_source_id: sourceId,
      p_run_kind: runKind,
      p_started_at: startedAt.toISOString(),
      p_lease_expires_at: leaseExpiresAt.toISOString(),
    } as never,
  );
  const data: unknown = result.data;
  const { error } = result;
  if (error) throwGiftCardJobRunRepoError("acquireGiftCardJobRun failed", error);
  if (data == null) return null;
  if (typeof data !== "string" || data.length === 0) {
    throw new Error("acquireGiftCardJobRun returned an invalid run ID.");
  }
  return data;
}
