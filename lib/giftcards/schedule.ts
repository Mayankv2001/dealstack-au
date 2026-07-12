/**
 * Australia/Sydney scheduling guards for the gift-card ingest — pure and
 * DST-safe by construction: local time comes from Intl with the IANA zone,
 * never from a fixed UTC offset.
 *
 * The external scheduler fires DAILY at both possible UTC equivalents of
 * 7:00 AM Sydney (20:00 UTC during AEDT, 21:00 UTC during AEST). The route
 * then accepts an invocation only when BOTH hold:
 *   1. it is currently the 7 o'clock hour in Australia/Sydney, and
 *   2. the last non-skipped run started ≥ RUN_INTERVAL_GUARD_HOURS ago
 *      (the every-other-day guard; 40h tolerates scheduler jitter while
 *      still meaning "every second local calendar day").
 * Duplicate or off-hour invocations return a safe machine-readable skip.
 */

export const SYDNEY_RUN_HOUR = 7;

/** Minimum hours between real runs — "every other day" with jitter margin. */
export const RUN_INTERVAL_GUARD_HOURS = 40;

const SYDNEY_HOUR_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  hour12: false,
});

/** Current hour of day (0–23) in Australia/Sydney, whatever DST is doing. */
export function sydneyHour(now: Date): number {
  return Number(SYDNEY_HOUR_FMT.format(now));
}

export function isSydneyRunHour(now: Date): boolean {
  return sydneyHour(now) === SYDNEY_RUN_HOUR;
}

export type ScheduleDecision =
  | { run: true }
  | { run: false; reason: "outside-run-hour" | "interval-guard" };

/**
 * Decide whether a cron invocation should run. `lastRunStartedAt` is the most
 * recent NON-SKIPPED run's start (null = never ran).
 */
export function decideSchedule(
  now: Date,
  lastRunStartedAt: Date | null,
  options: { force?: boolean } = {}
): ScheduleDecision {
  if (!options.force && !isSydneyRunHour(now)) {
    return { run: false, reason: "outside-run-hour" };
  }
  if (lastRunStartedAt) {
    const hoursSince =
      (now.getTime() - lastRunStartedAt.getTime()) / 3_600_000;
    if (hoursSince < RUN_INTERVAL_GUARD_HOURS) {
      return { run: false, reason: "interval-guard" };
    }
  }
  return { run: true };
}
