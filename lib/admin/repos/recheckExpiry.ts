import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { isApprovedOzBargainPostUrl } from "@/lib/security/urlPolicy";
import type {
  RecheckArchiveInput,
  RecheckCandidate,
  RecheckRunMetrics,
  RecheckStampPatch,
  RecheckStartResult,
} from "@/lib/monitor/runRecheckExpiry";

/**
 * Expiry-recheck data access — SERVICE-ROLE ONLY.
 *
 * Concrete deps for lib/monitor/runRecheckExpiry: it claims/finishes the
 * one-running lock (migration 020), lists PENDING items due for a recheck,
 * archives confirmed-gone items via the transactional RPC, and stamps
 * check outcomes back onto feed_items. Like the other admin repos it must run
 * only on the server behind the cron secret; getSupabaseAdmin()'s browser guard
 * is the backstop. It performs NO outbound OzBargain request itself — the
 * networked probe lives in lib/monitor/validateSourcePost.
 */

/** A 'running' recheck row older than this is treated as crashed, not in-flight. */
const STALE_RUN_MINUTES = 15;
/** Postgres unique_violation SQLSTATE — the one-running-row lock (020). */
const UNIQUE_VIOLATION = "23505";

interface CandidateRow {
  id: string;
  link: string;
  source_native_id: string;
  consecutive_validation_failures: number | null;
  failure_streak_started_at: string | null;
  source_marked_expired: boolean | null;
  declared_expires_at: string | null;
}

/**
 * Pending items due for a recheck — never-checked first, then oldest-checked,
 * throttled by the min-interval. Only OzBargain post URLs are in scope; the
 * `like` narrows in SQL and the exact allow-list check fences it precisely.
 */
export async function listRecheckCandidates(
  now: Date,
  limit: number,
  minIntervalHours: number
): Promise<RecheckCandidate[]> {
  const db = getSupabaseAdmin();
  const dueBefore = new Date(
    now.getTime() - minIntervalHours * 60 * 60 * 1000
  ).toISOString();
  const { data, error } = await db
    .from("feed_items")
    .select(
      "id, link, source_native_id, consecutive_validation_failures, failure_streak_started_at, source_marked_expired, declared_expires_at"
    )
    .eq("review_state", "new")
    .like("link", "%ozbargain.com.au/node/%")
    .or(`last_source_check_at.is.null,last_source_check_at.lt.${dueBefore}`)
    .order("last_source_check_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(`listRecheckCandidates failed: ${error.message}`);

  return ((data ?? []) as unknown as CandidateRow[])
    .filter((row) => isApprovedOzBargainPostUrl(row.link))
    .map((row) => ({
      id: row.id,
      link: row.link,
      sourceNativeId: row.source_native_id,
      consecutiveFailures: row.consecutive_validation_failures ?? 0,
      failureStreakStartedAt: row.failure_streak_started_at
        ? new Date(row.failure_streak_started_at)
        : null,
      sourceMarkedExpired: row.source_marked_expired === true,
      declaredExpiresAt: row.declared_expires_at
        ? new Date(row.declared_expires_at)
        : null,
    }));
}

/** Archive one confirmed-gone pending item (transactional archive + audit). */
export async function archiveRecheckItem(
  id: string,
  input: RecheckArchiveInput
): Promise<boolean> {
  const db = getSupabaseAdmin();
  const { data, error } = await db.rpc("archive_recheck_feed_item", {
    p_feed_item_id: id,
    p_archive_reason: input.archiveReason,
    p_source_status: input.sourceStatus,
    p_source_identifier: input.sourceIdentifier,
    p_run_id: input.runId,
    p_checked_at: input.checkedAt.toISOString(),
    // p_signal has `default null` in SQL; omitting it (undefined) is identical.
    p_signal: input.signal ?? undefined,
  });
  if (error) throw new Error(`archiveRecheckItem failed: ${error.message}`);
  return data === true;
}

/** Stamp a non-archiving check outcome (active reset, or a transient failure). */
export async function stampRecheckItem(
  id: string,
  patch: RecheckStampPatch
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("feed_items")
    .update({
      source_status: patch.sourceStatus,
      last_source_check_at: patch.lastSourceCheckAt.toISOString(),
      last_validated_at: patch.lastValidatedAt
        ? patch.lastValidatedAt.toISOString()
        : undefined,
      consecutive_validation_failures: patch.consecutiveFailures,
      failure_streak_started_at: patch.failureStreakStartedAt
        ? patch.failureStreakStartedAt.toISOString()
        : null,
      last_validation_error: patch.lastValidationError,
    })
    // Only touch rows still awaiting review — never a row that raced to
    // imported/archived/rejected while this run was in flight.
    .eq("id", id)
    .eq("review_state", "new");
  if (error) throw new Error(`stampRecheckItem failed: ${error.message}`);
}

/**
 * Claim the single 'running' recheck slot. Mirrors startPipelineRun: supersede a
 * stale 'running' row first, then insert; a unique_violation on the partial
 * index (020) means another run is genuinely in flight — returned as a typed
 * skip, not thrown.
 */
export async function startRecheckRun(
  startedAt: Date
): Promise<RecheckStartResult> {
  const db = getSupabaseAdmin();
  const staleCutoff = new Date(
    startedAt.getTime() - STALE_RUN_MINUTES * 60 * 1000
  ).toISOString();
  const { error: takeoverError } = await db
    .from("ozb_recheck_runs")
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
    throw new Error(`startRecheckRun stale takeover failed: ${takeoverError.message}`);
  }

  const { data, error } = await db
    .from("ozb_recheck_runs")
    .insert({ started_at: startedAt.toISOString(), status: "running" })
    .select("id")
    .single();
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { started: false, reason: "already-running" };
    }
    throw new Error(`startRecheckRun failed: ${error.message}`);
  }
  return { started: true, runId: data.id };
}

export async function finishRecheckRun(
  id: string,
  metrics: RecheckRunMetrics,
  finishedAt: Date
): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("ozb_recheck_runs")
    .update({
      finished_at: finishedAt.toISOString(),
      status: metrics.status,
      dry_run: metrics.dryRun,
      scanned: metrics.scanned,
      active: metrics.active,
      expired: metrics.expired,
      deleted: metrics.deleted,
      unknown: metrics.unknown,
      fetch_failed: metrics.fetchFailed,
      would_archive: metrics.wouldArchive,
      actually_archived: metrics.actuallyArchived,
      skipped: metrics.skipped,
      errors: metrics.errors,
    })
    .eq("id", id);
  if (error) throw new Error(`finishRecheckRun failed: ${error.message}`);
}
