/**
 * Pure date helpers used by admin data-quality checks.
 * No Supabase, Next.js, or external deps — safe to unit-test.
 */

/**
 * Returns the ISO Monday (YYYY-MM-DD) of the week containing `date`, using
 * Australia/Sydney calendar time to determine which week the date falls in.
 *
 * Uses UTC arithmetic after extracting the AU calendar date so the result is
 * stable regardless of the server's local timezone setting.
 */
export function weekMondayAU(date: Date = new Date()): string {
  const auDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const [yearStr, monthStr, dayStr] = auDateStr.split("-");
  const utc = new Date(
    Date.UTC(
      parseInt(yearStr, 10),
      parseInt(monthStr, 10) - 1,
      parseInt(dayStr, 10)
    )
  );
  const dow = utc.getUTCDay(); // 0 = Sun, 1 = Mon, …, 6 = Sat
  utc.setUTCDate(utc.getUTCDate() - ((dow + 6) % 7)); // rewind to Monday

  return [
    utc.getUTCFullYear(),
    String(utc.getUTCMonth() + 1).padStart(2, "0"),
    String(utc.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * True when a weekly deal's weekOf (YYYY-MM-DD) predates the current week's
 * Monday in AU/Sydney time — the editorial deal is from a prior week.
 */
export function isWeekOfStale(weekOf: string, now: Date = new Date()): boolean {
  return weekOf < weekMondayAU(now);
}
