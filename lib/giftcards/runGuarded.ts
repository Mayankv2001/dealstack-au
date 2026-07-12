import type { IngestMetrics } from "./runIngest";

/**
 * Guarded ingest orchestration — the safety envelope around a claimed run.
 *
 * Once the one-running lock is acquired, EVERY later outcome must finalise the
 * run: success/partial/error metrics via `finish`, or — if the ingest throws
 * before it can report metrics — an `error` finalisation via `fail`, which is
 * what releases the lock so the next invocation is not permanently blocked.
 *
 * Two invariants this pure function guarantees (proved in tests):
 *   1. A thrown ingest never leaves the run `running`: `fail` is always called.
 *   2. Observability (`report`) is best-effort — its own failure can neither
 *      block nor mask finalisation, and never rejects the orchestration.
 *
 * Dependency-injected so it is fully unit-testable with no DB, clock or network.
 */

export interface GuardedIngestDeps {
  /** Claim the single one-running lock (mirrors startIngestRun). */
  acquire(): Promise<
    { started: true; runId: string } | { started: false; reason: string }
  >;
  /** Run the ingest for the claimed run id. May throw. */
  run(runId: string): Promise<IngestMetrics>;
  /** Finalise a completed run with its metrics (releases the lock). */
  finish(runId: string, metrics: IngestMetrics): Promise<void>;
  /** Finalise a still-running run as `error` (releases the lock). */
  fail(runId: string, message: string): Promise<void>;
  /** Best-effort operational report. Its failure must never propagate. */
  report(message: string): Promise<void>;
}

export type GuardedIngestOutcome =
  | { ran: false; skipped: string }
  | { ran: true; metrics: IngestMetrics }
  | { ran: true; failed: true };

/** Run `report` without ever letting an observability failure escape. */
async function safeReport(deps: GuardedIngestDeps, message: string): Promise<void> {
  try {
    await deps.report(message);
  } catch {
    // Observability is non-fatal by contract — swallow so it can neither
    // block nor mask finalisation.
  }
}

export async function runGuardedIngest(
  deps: GuardedIngestDeps
): Promise<GuardedIngestOutcome> {
  const lock = await deps.acquire();
  if (!lock.started) return { ran: false, skipped: lock.reason };
  const { runId } = lock;

  try {
    const metrics = await deps.run(runId);
    await deps.finish(runId, metrics);
    if (metrics.status !== "ok") {
      await safeReport(deps, metrics.errors.join("; ") || metrics.fetchStatus);
    }
    return { ran: true, metrics };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // GUARANTEED finalisation FIRST — release the lock before anything else,
    // so a later observability failure cannot block it. A failure of `fail`
    // itself is swallowed: the 15-minute stale-run takeover is the backstop.
    try {
      await deps.fail(runId, message);
    } catch {
      // best-effort; stale-run takeover in startIngestRun is the backstop
    }
    await safeReport(deps, message);
    return { ran: true, failed: true };
  }
}
