/**
 * Reconcile job-run registry (TASK-05) — service-role only.
 *
 * Reconciliation runs are recorded in the shared gift_card_ingest_runs ledger
 * tagged `run_kind = 'reconcile'` (migration 030). Acquisition and stale
 * takeover are scoped to the anchored source + kind. Migration 030 also has a
 * narrower mutation fence: reconcile and activate/archive cannot overlap,
 * while private staging ingest work may run independently.
 *
 * NOTE: `run_kind` requires migration 030 (authored, not yet applied). The
 * reconcile route that calls these is DEFAULT-OFF and never runs in production
 * until 030 is applied and the env flag is enabled — so these functions are
 * written for the applied-030 schema. The narrow cast below is removed when
 * generated types include the column.
 */

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { throwGiftCardJobRunRepoError } from "./giftCardJobRunErrors";
import { acquireGiftCardJobRun } from "./giftCardJobRuns";

/** Reconcile is cross-source; the run row is anchored to the primary source. */
export const RECONCILE_RUN_SOURCE_ID = "gcdb";
const STALE_RUN_MINUTES = 30;

export type ReconcileStartResult =
  | { started: true; runId: string }
  | { started: false; reason: "already-running" };

/**
 * Claim the reconcile slot. Only a stale reconcile row for this job's source
 * can be finalised; another source or run kind is never taken over. The DB
 * returns `already-running` for a same-kind duplicate or lifecycle fence clash.
 */
export async function startReconcileRun(
  startedAt: Date
): Promise<ReconcileStartResult> {
  const runId = await acquireGiftCardJobRun({
    sourceId: RECONCILE_RUN_SOURCE_ID,
    runKind: "reconcile",
    startedAt,
    staleAfterMinutes: STALE_RUN_MINUTES,
  });
  return runId
    ? { started: true, runId }
    : { started: false, reason: "already-running" };
}

/** Most recent non-skipped reconcile run start, for the once-per-day guard. */
export async function lastReconcileRunStart(): Promise<Date | null> {
  const db = getSupabaseAdmin();
  // `run_kind` is added by migration 030 (authored, not yet applied), so the
  // generated types don't know the column. Narrow `as never` casts keep this
  // filter isolated to the repo boundary; remove them when types regenerate.
  const { data, error } = await db
    .from("gift_card_ingest_runs")
    .select("started_at, status")
    .eq("source_id", RECONCILE_RUN_SOURCE_ID)
    .eq("run_kind" as never, "reconcile" as never)
    .neq("status", "skipped")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwGiftCardJobRunRepoError("lastReconcileRunStart failed", error);
  return data ? new Date(data.started_at) : null;
}
