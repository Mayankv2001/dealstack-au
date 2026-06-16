/**
 * Pure backoff / retry math for the OzBargain feed monitor.
 *
 * OFFLINE ONLY — no network, no DB, no env, no clock of its own (the caller
 * passes `now`). It turns a feed's failure count (and any `Retry-After`) into the
 * next allowed fetch time, and decides when a feed has failed enough to be
 * auto-disabled. Unit-tested in tests/monitor/backoff.test.ts.
 *
 * It never causes a request — it only computes timestamps the orchestrator then
 * writes to `feed_sources` poll-state.
 */

/** Auto-disable a feed once its failure_count reaches this many consecutive fails. */
export const FAILURE_DISABLE_THRESHOLD = 5;

/** First-failure backoff; doubles each subsequent failure. */
const BASE_BACKOFF_MINUTES = 30;
/** Ceiling so the exponential never pushes a feed out absurdly far. */
const MAX_BACKOFF_HOURS = 48;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Parse a `Retry-After` header into a delay in seconds, or null when absent /
 * unparseable. Supports both forms: delta-seconds ("120") and an HTTP-date.
 * A date already in the past clamps to 0 (retry allowed immediately).
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: Date
): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;

  // delta-seconds form, e.g. "Retry-After: 120"
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) ? seconds : null;
  }

  // HTTP-date form, e.g. "Retry-After: Wed, 21 Oct 2026 07:28:00 GMT"
  const whenMs = Date.parse(trimmed);
  if (Number.isNaN(whenMs)) return null;
  const deltaSec = Math.round((whenMs - now.getTime()) / 1000);
  return deltaSec > 0 ? deltaSec : 0;
}

/**
 * Next allowed fetch after a SUCCESS (ok / not-modified): simply `now` plus the
 * configured minimum polling interval — we never poll a feed faster than this.
 */
export function nextEarliestAfterSuccess(
  now: Date,
  minIntervalHours: number
): string {
  return new Date(now.getTime() + minIntervalHours * HOUR_MS).toISOString();
}

/**
 * Next allowed fetch after a FAILURE (error / blocked). Exponential on the
 * already-incremented failure count, capped at MAX_BACKOFF_HOURS, and never
 * sooner than a server-provided `Retry-After`.
 */
export function nextEarliestAfterFailure(
  now: Date,
  failureCount: number,
  retryAfterSeconds: number | null
): string {
  const steps = Math.max(0, failureCount - 1);
  const exponentialMs = BASE_BACKOFF_MINUTES * 2 ** steps * MINUTE_MS;
  let delayMs = Math.min(exponentialMs, MAX_BACKOFF_HOURS * HOUR_MS);
  if (retryAfterSeconds != null) {
    delayMs = Math.max(delayMs, retryAfterSeconds * 1000);
  }
  return new Date(now.getTime() + delayMs).toISOString();
}

/** A feed should be auto-disabled once it reaches the failure threshold. */
export function shouldAutoDisable(failureCount: number): boolean {
  return failureCount >= FAILURE_DISABLE_THRESHOLD;
}
