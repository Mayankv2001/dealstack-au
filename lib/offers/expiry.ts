/**
 * Read-time expiry guard for PUBLIC reads.
 *
 * "Expired" means expiry_date is strictly before today's date in
 * Australia/Sydney — the same convention as the cleanup script
 * (scripts/cleanup-old-deals.ts, `lt(expiry_date, TODAY)`) and the admin
 * data-quality report (lib/admin/repos/dashboard.ts DQ_DAY_FMT): an offer
 * remains live ON its expiry day, and a null expiry means evergreen.
 * Dates compare as YYYY-MM-DD strings — never via Date parsing, which is
 * UTC-relative and off by one around AU midnight.
 */

const AU_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** AU-local calendar date as YYYY-MM-DD (en-CA locale formats exactly that). */
export function todayAU(now: Date = new Date()): string {
  return AU_DAY_FMT.format(now);
}

/** True when the date has strictly passed in AU time. Null/undefined → false. */
export function isPastExpiry(
  expiryDate: string | null | undefined,
  today: string
): boolean {
  return expiryDate != null && expiryDate < today;
}

/** Drops hard-expired items; keeps evergreen (null) and today-or-later. */
export function filterLive<T extends { expiryDate?: string | null }>(
  items: T[],
  today: string = todayAU()
): T[] {
  return items.filter((item) => !isPastExpiry(item.expiryDate, today));
}
