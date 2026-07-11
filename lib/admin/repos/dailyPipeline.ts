import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayAU } from "@/lib/offers/expiry";
import { validateSourcePost } from "@/lib/monitor/validateSourcePost";

export interface ArchiveSummary {
  total: number;
}

export interface ValidationSummary {
  checked: number;
  archived: number;
  unknown: number;
}

export interface PipelineRunPatch {
  status: "ok" | "partial" | "error" | "disabled" | "blocked";
  expiredArchived: number;
  invalidArchived: number;
  validationChecked: number;
  validationUnknown: number;
  feedsProcessed: number;
  itemsFetched: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsSkipped: number;
  errors: string[];
}

export async function archiveExpiredDeals(now: Date): Promise<ArchiveSummary> {
  const db = getSupabaseAdmin();
  const today = todayAU(now);
  const { data, error } = await db.rpc("archive_expired_deals", {
    p_today: today,
    p_archived_at: now.toISOString(),
  });
  if (error) throw new Error(`archiveExpiredDeals failed: ${error.message}`);
  return { total: data ?? 0 };
}

export async function validatePublishedSignals(
  now: Date,
  userAgent: string,
  limit = 100
): Promise<ValidationSummary> {
  const db = getSupabaseAdmin();
  const dueBefore = new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("ozbargain_signals")
    .select("id, source_url")
    .eq("status", "approved")
    .eq("is_sample", false)
    .or(`last_validated_at.is.null,last_validated_at.lt.${dueBefore}`)
    .order("last_validated_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`list validation candidates failed: ${error.message}`);

  let archived = 0;
  let unknown = 0;
  const candidates = data ?? [];
  // Small bounded concurrency keeps the daily job within its runtime without
  // hammering the source host.
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const results = await Promise.all(
      batch.map(async (signal) => ({
        signal,
        result: await validateSourcePost(signal.source_url, userAgent),
      }))
    );
    for (const { signal, result } of results) {
      const checkedAt = new Date().toISOString();
      if (result.status === "removed") {
        const reason = result.reason ?? "source-post-removed";
        const { data: changed, error: updateError } = await db.rpc(
          "archive_invalid_signal",
          {
            p_signal_id: signal.id,
            p_reason: reason,
            p_archived_at: checkedAt,
          }
        );
        if (updateError) throw new Error(`archive invalid signal failed: ${updateError.message}`);
        if (changed) archived++;
      } else {
        const { error: updateError } = await db
          .from("ozbargain_signals")
          .update({ last_validated_at: checkedAt })
          .eq("id", signal.id)
          .eq("status", "approved");
        if (updateError) throw new Error(`stamp signal validation failed: ${updateError.message}`);
        if (result.status === "unknown") unknown++;
      }
    }
  }
  return { checked: data?.length ?? 0, archived, unknown };
}

/** A 'running' row older than this is treated as crashed, not in-flight. */
const STALE_RUN_MINUTES = 30;

/** Postgres unique_violation SQLSTATE — the one-running-row lock (016). */
const UNIQUE_VIOLATION = "23505";

export type StartRunOutcome =
  | { started: true; runId: string }
  | { started: false; reason: "already-running" };

/**
 * Claim the single 'running' slot for a new pipeline run.
 *
 * Two steps: first supersede any 'running' row that has sat unfinished past
 * STALE_RUN_MINUTES (the process that started it crashed before calling
 * finishPipelineRun, so it must not hold the lock forever), then attempt the
 * insert. A unique_violation on the partial index (migration 016) means
 * another run is genuinely still in flight — return that as a typed outcome
 * instead of throwing, so the caller can skip this invocation cleanly.
 */
export async function startPipelineRun(startedAt: Date): Promise<StartRunOutcome> {
  const db = getSupabaseAdmin();

  const staleCutoff = new Date(
    startedAt.getTime() - STALE_RUN_MINUTES * 60 * 1000
  ).toISOString();
  const { error: takeoverError } = await db
    .from("daily_pipeline_runs")
    .update({
      status: "error",
      finished_at: startedAt.toISOString(),
      errors: [
        `superseded: run exceeded ${STALE_RUN_MINUTES} minutes without finishing (stale takeover at ${startedAt.toISOString()})`,
      ],
    })
    .eq("status", "running")
    .lt("started_at", staleCutoff);
  if (takeoverError) {
    throw new Error(`startPipelineRun stale takeover failed: ${takeoverError.message}`);
  }

  const { data, error } = await db
    .from("daily_pipeline_runs")
    .insert({ started_at: startedAt.toISOString(), status: "running" })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { started: false, reason: "already-running" };
    }
    throw new Error(`startPipelineRun failed: ${error.message}`);
  }
  return { started: true, runId: data.id };
}

export async function finishPipelineRun(
  id: string,
  patch: PipelineRunPatch,
  finishedAt: Date
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("daily_pipeline_runs")
    .update({
      finished_at: finishedAt.toISOString(),
      status: patch.status,
      expired_archived: patch.expiredArchived,
      invalid_archived: patch.invalidArchived,
      validation_checked: patch.validationChecked,
      validation_unknown: patch.validationUnknown,
      feeds_processed: patch.feedsProcessed,
      items_fetched: patch.itemsFetched,
      items_new: patch.itemsNew,
      items_updated: patch.itemsUpdated,
      items_skipped: patch.itemsSkipped,
      errors: patch.errors,
    })
    .eq("id", id);
  if (error) throw new Error(`finishPipelineRun failed: ${error.message}`);
}
