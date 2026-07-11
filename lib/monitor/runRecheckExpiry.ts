import { isApprovedOzBargainPostUrl } from "@/lib/security/urlPolicy";
import type { SourceClassification, SourceStatus } from "./validateSourcePost";
import {
  classifyStoredSourceState,
  decideRecheckOutcome,
  type ArchiveReason,
} from "./recheckExpiry";

/**
 * Orchestrates one bounded expiry-recheck run over PENDING OzBargain feed items.
 *
 * Pure-ish and dependency-injected (clock, DB, and classifier are all deps) so
 * the whole flow is unit-testable offline. It never fetches or writes directly;
 * it only calls the injected functions. Concurrency is capped so a run can never
 * fan out unbounded requests at the source host.
 *
 * DRY-RUN: when `config.dryRun` is true it classifies + counts (including
 * `wouldArchive`) but performs NO writes — no feed_items change, no archival, no
 * audit. Preview is the default and the required first step of any rollout.
 */

/** One pending item as the recheck run sees it. */
export interface RecheckCandidate {
  id: string;
  /** Approved OzBargain post URL (the source to re-probe). */
  link: string;
  sourceNativeId: string;
  consecutiveFailures: number;
  failureStreakStartedAt: Date | null;
  /** Stored feed facts (see StoredSourceFacts) — checked BEFORE any probe. */
  sourceMarkedExpired: boolean;
  declaredExpiresAt: Date | null;
}

export interface RecheckStampPatch {
  sourceStatus: SourceStatus;
  lastSourceCheckAt: Date;
  /** Set only on a confirmed-active check; null otherwise. */
  lastValidatedAt: Date | null;
  consecutiveFailures: number;
  failureStreakStartedAt: Date | null;
  lastValidationError: string | null;
}

export interface RecheckArchiveInput {
  archiveReason: ArchiveReason;
  sourceStatus: SourceStatus;
  /** Safe source identifier for the audit trail (never a secret/response body). */
  sourceIdentifier: string;
  /** Which signal produced the archival, e.g. 'feed-expired-marker',
   * 'feed-declared-expiry-passed', 'source-http-404' (audit provenance). */
  signal: string | null;
  /** The run this archival belongs to (recorded in the audit diff). */
  runId: string;
  checkedAt: Date;
}

export type RecheckStartResult =
  | { started: true; runId: string }
  | { started: false; reason: "already-running" };

export interface RecheckRunMetrics {
  status: "ok" | "partial";
  dryRun: boolean;
  scanned: number;
  active: number;
  expired: number;
  deleted: number;
  unknown: number;
  fetchFailed: number;
  /** Items whose classification would archive them (explicit expired/deleted). */
  wouldArchive: number;
  /** Items actually archived this run (always 0 in a dry run). */
  actuallyArchived: number;
  skipped: number;
  errors: string[];
}

export interface RunRecheckConfig {
  batchSize: number;
  dryRun: boolean;
}

export interface RunRecheckDeps {
  now: () => Date;
  startRun(startedAt: Date): Promise<RecheckStartResult>;
  finishRun(id: string, metrics: RecheckRunMetrics, finishedAt: Date): Promise<void>;
  listCandidates(now: Date, limit: number): Promise<RecheckCandidate[]>;
  classify(url: string): Promise<SourceClassification>;
  archive(id: string, input: RecheckArchiveInput): Promise<boolean>;
  stamp(id: string, patch: RecheckStampPatch): Promise<void>;
}

export type RunRecheckOutcome =
  | { started: true; metrics: RecheckRunMetrics & { runId: string } }
  | { started: false; reason: "already-running" };

/** Bounded concurrency — small, polite to the source host, matches the
 * published-signal validator's window. */
const CONCURRENCY = 4;

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Accumulator {
  active: number;
  expired: number;
  deleted: number;
  unknown: number;
  fetchFailed: number;
  wouldArchive: number;
  actuallyArchived: number;
  skipped: number;
  errors: string[];
}

async function processOne(
  candidate: RecheckCandidate,
  deps: RunRecheckDeps,
  now: Date,
  runId: string,
  dryRun: boolean,
  acc: Accumulator
): Promise<void> {
  // Scope guard — defensive even though listCandidates already filters. An item
  // whose stored link is not an approved OzBargain post is never probed.
  if (!isApprovedOzBargainPostUrl(candidate.link)) {
    acc.skipped++;
    return;
  }

  // Stored feed facts first: OzBargain's own RSS marks expiry (explicit
  // marker / declared timestamp), captured at ingest. When they already prove
  // the deal expired, the item is classified WITHOUT any outbound request.
  const storedSignal = classifyStoredSourceState(candidate, now);

  let classification: SourceClassification;
  if (storedSignal) {
    classification = { status: "expired", httpStatus: null, reason: storedSignal };
  } else {
    try {
      classification = await deps.classify(candidate.link);
    } catch (error) {
      // classify() is designed not to throw, but a wrapper might. Treat as a
      // skipped item (never archive on an error) and surface it.
      acc.skipped++;
      acc.errors.push(`${candidate.id}: classify failed: ${message(error)}`);
      return;
    }
  }

  const status = classification.status;
  if (status === "active") acc.active++;
  else if (status === "expired") acc.expired++;
  else if (status === "deleted") acc.deleted++;
  else if (status === "fetch_failed") acc.fetchFailed++;
  else acc.unknown++;

  const decision = decideRecheckOutcome(
    {
      consecutiveFailures: candidate.consecutiveFailures,
      failureStreakStartedAt: candidate.failureStreakStartedAt,
    },
    status,
    now
  );

  if (decision.action === "archive") acc.wouldArchive++;

  // Preview mode: classify + count only, no writes of any kind.
  if (dryRun) return;

  try {
    if (decision.action === "archive") {
      const archived = await deps.archive(candidate.id, {
        archiveReason: decision.archiveReason,
        sourceStatus: decision.sourceStatus,
        sourceIdentifier: candidate.link,
        signal: classification.reason,
        runId,
        checkedAt: now,
      });
      if (archived) acc.actuallyArchived++;
      else acc.skipped++; // row raced out of 'new' between select and archive
    } else if (decision.action === "reset") {
      await deps.stamp(candidate.id, {
        sourceStatus: "active",
        lastSourceCheckAt: now,
        lastValidatedAt: now,
        consecutiveFailures: 0,
        failureStreakStartedAt: null,
        lastValidationError: null,
      });
    } else {
      await deps.stamp(candidate.id, {
        sourceStatus: decision.sourceStatus,
        lastSourceCheckAt: now,
        lastValidatedAt: null,
        consecutiveFailures: decision.consecutiveFailures,
        failureStreakStartedAt: decision.failureStreakStartedAt,
        lastValidationError: classification.reason,
      });
    }
  } catch (error) {
    // A persistence failure leaves the item untouched (still in review) — safe.
    acc.errors.push(`${candidate.id}: ${message(error)}`);
  }
}

export async function runRecheckExpiry(
  config: RunRecheckConfig,
  deps: RunRecheckDeps
): Promise<RunRecheckOutcome> {
  const startedAt = deps.now();
  const start = await deps.startRun(startedAt);
  if (!start.started) return { started: false, reason: start.reason };
  const runId = start.runId;

  const acc: Accumulator = {
    active: 0,
    expired: 0,
    deleted: 0,
    unknown: 0,
    fetchFailed: 0,
    wouldArchive: 0,
    actuallyArchived: 0,
    skipped: 0,
    errors: [],
  };

  let scanned = 0;
  try {
    const candidates = await deps.listCandidates(startedAt, config.batchSize);
    scanned = candidates.length;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((candidate) =>
          processOne(candidate, deps, startedAt, runId, config.dryRun, acc)
        )
      );
    }
  } catch (error) {
    acc.errors.push(`recheck run: ${message(error)}`);
  }

  const metrics: RecheckRunMetrics = {
    status: acc.errors.length === 0 ? "ok" : "partial",
    dryRun: config.dryRun,
    scanned,
    active: acc.active,
    expired: acc.expired,
    deleted: acc.deleted,
    unknown: acc.unknown,
    fetchFailed: acc.fetchFailed,
    wouldArchive: acc.wouldArchive,
    actuallyArchived: acc.actuallyArchived,
    skipped: acc.skipped,
    errors: acc.errors,
  };
  await deps.finishRun(runId, metrics, deps.now());
  return { started: true, metrics: { runId, ...metrics } };
}
