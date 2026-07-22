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

const SYDNEY_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Current hour of day (0–23) in Australia/Sydney, whatever DST is doing. */
export function sydneyHour(now: Date): number {
  return Number(SYDNEY_HOUR_FMT.format(now));
}

export function isSydneyRunHour(now: Date): boolean {
  return sydneyHour(now) === SYDNEY_RUN_HOUR;
}

/** YYYY-MM-DD for the Sydney calendar day at an arbitrary UTC instant. */
export function sydneyLocalDate(now: Date): string {
  const parts = Object.fromEntries(
    SYDNEY_DATE_FMT.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
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

/**
 * Minimum hours between real runs of a WEEKLY-permissioned source. 150h ≈ 6.25
 * days — deliberately above six local days and below seven. With the scheduler
 * firing daily at the two 7am-Sydney slots this admits exactly ONE real run per
 * 7-day window: the six intervening days (24–144h) fall under the guard, and
 * the following week's run (~168h, or 167–169h across a 23/25-hour DST week)
 * clears it, so a week is never skipped. Distinct from
 * RUN_INTERVAL_GUARD_HOURS, which is the GCDB feed's every-other-day cadence.
 */
export const WEEKLY_RUN_INTERVAL_GUARD_HOURS = 150;

export type WeeklyScheduleDecision =
  | { run: true }
  | { run: false; reason: "outside-run-hour" | "weekly-interval-guard" };

/**
 * Decide whether a WEEKLY cron invocation should run. Same 7am-Sydney hour gate
 * as `decideSchedule`, but the interval backstop is a full week
 * (`WEEKLY_RUN_INTERVAL_GUARD_HOURS`) rather than 40h, so daily double-slot
 * firing of a once-per-week-permissioned source (e.g. the Point Hacks weekly
 * gift-card page) cannot over-fetch it. `lastRunStartedAt` is the most recent
 * NON-SKIPPED run's start (null = never ran). `force` bypasses only the run
 * hour, never the interval — matching `decideSchedule`'s convention.
 */
export function decideWeeklySchedule(
  now: Date,
  lastRunStartedAt: Date | null,
  options: { force?: boolean } = {},
): WeeklyScheduleDecision {
  if (!options.force && !isSydneyRunHour(now)) {
    return { run: false, reason: "outside-run-hour" };
  }
  if (lastRunStartedAt) {
    const hoursSince =
      (now.getTime() - lastRunStartedAt.getTime()) / 3_600_000;
    if (hoursSince < WEEKLY_RUN_INTERVAL_GUARD_HOURS) {
      return { run: false, reason: "weekly-interval-guard" };
    }
  }
  return { run: true };
}

export type DailyLifecycleScheduleDecision =
  | { run: true; localDate: string }
  | {
      run: false;
      localDate: string;
      reason: "outside-run-hour" | "already-ran-local-day";
    };

/**
 * Daily lifecycle gate. Unlike the legacy ingest guard above, this compares
 * Sydney calendar dates rather than elapsed hours, so 23/25-hour DST days do
 * not create a missed or duplicate run. `force` bypasses only the 07:00 hour;
 * it never bypasses the same-local-day idempotency guard.
 */
export function decideDailyLifecycleSchedule(
  now: Date,
  lastSuccessfulRunStartedAt: Date | null,
  options: { force?: boolean } = {},
): DailyLifecycleScheduleDecision {
  const localDate = sydneyLocalDate(now);
  if (!options.force && !isSydneyRunHour(now)) {
    return { run: false, localDate, reason: "outside-run-hour" };
  }
  if (
    lastSuccessfulRunStartedAt &&
    sydneyLocalDate(lastSuccessfulRunStartedAt) >= localDate
  ) {
    return { run: false, localDate, reason: "already-ran-local-day" };
  }
  return { run: true, localDate };
}
