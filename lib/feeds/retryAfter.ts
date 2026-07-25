/**
 * `Retry-After` parsing for the gift-card feed fetcher.
 *
 * OFFLINE ONLY — no network, no DB, no env, no clock of its own (the caller
 * passes `now`). Unit-tested in tests/feeds/retryAfter.test.ts.
 */

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
