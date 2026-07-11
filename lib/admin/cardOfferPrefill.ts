/** Parse a bounded, non-negative numeric card-offer query parameter. */
export function parseCardNumberParam(
  value: string | string[] | undefined,
  max: number
): number | null {
  const first = Array.isArray(value) ? value[0] : value;
  const raw = (first ?? "").trim().slice(0, 32);
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= max ? parsed : null;
}
