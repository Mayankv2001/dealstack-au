const MELBOURNE_TIME_ZONE = "Australia/Melbourne";

function datePartsInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: value("year"), month: value("month"), day: value("day") };
}

/** Calendar date at the DealStack operating timezone, formatted YYYY-MM-DD. */
export function melbourneDateKey(now: Date = new Date()): string {
  const { year, month, day } = datePartsInTimeZone(now, MELBOURNE_TIME_ZONE);
  return `${year}-${month}-${day}`;
}

/** True when `today` is inside the inclusive start/expiry range. */
export function isActiveDateRange(
  startDate: string | null | undefined,
  expiryDate: string | null | undefined,
  today: string
): boolean {
  if (startDate && startDate > today) return false;
  if (expiryDate && expiryDate < today) return false;
  return true;
}

/** ISO date of the Monday containing the supplied YYYY-MM-DD date. */
export function mondayOfWeek(dateKey: string): string {
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function formatWeekLabel(weekOf: string): string {
  const date = new Date(`${weekOf}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Current deals";
  return `Week of ${new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)}`;
}
