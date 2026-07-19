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

/** Days ahead treated as "expiring soon" on public deal cards. */
export const EXPIRY_SOON_DAYS = 7;

/** "YYYY-MM-DD" plus N days. UTC arithmetic on the date parts cannot DST-shift. */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * True when expiry falls within `soonDays` of today (inclusive) and is not
 * already past. Compares AU-local CALENDAR DATES via todayAU() — no fixed
 * +10:00 offset, so AEDT is handled correctly.
 */
export function isExpiringSoonAU(
  expiryDate: string | null | undefined,
  now: Date = new Date(),
  soonDays: number = EXPIRY_SOON_DAYS
): boolean {
  if (expiryDate == null) return false;
  const today = todayAU(now);
  if (expiryDate < today) return false; // already past
  return expiryDate <= addDaysToIsoDate(today, soonDays);
}

/** "YYYY-MM-DD" → UTC ms of the date part (calendar arithmetic, DST-immune). */
function isoDateToUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * Whole calendar days from today (AU) until expiry: 0 = expires today,
 * 1 = tomorrow, negative = already past. Null expiry → null (evergreen).
 */
export function daysUntilExpiryAU(
  expiryDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (expiryDate == null) return null;
  const diff = isoDateToUtcMs(expiryDate) - isoDateToUtcMs(todayAU(now));
  return Math.round(diff / 86_400_000);
}

/**
 * Urgency phrasing for deal cards: "Ends today" / "Ends tomorrow" /
 * "Ends in N days". Null when the offer is evergreen, already past, or not
 * within the soon window — callers fall back to the absolute date.
 */
export function expiryUrgencyLabelAU(
  expiryDate: string | null | undefined,
  now: Date = new Date(),
  soonDays: number = EXPIRY_SOON_DAYS
): string | null {
  if (!isExpiringSoonAU(expiryDate, now, soonDays)) return null;
  const days = daysUntilExpiryAU(expiryDate, now);
  if (days == null || days < 0) return null;
  if (days === 0) return "Ends today";
  if (days === 1) return "Ends tomorrow";
  return `Ends in ${days} days`;
}
