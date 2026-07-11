/**
 * Pull the first AUD amount out of curated price text.
 *   "$1,799 (was $2,199)" -> 1799
 *   "$795 member price"   -> 795
 *   "half price selected" -> null
 */
export function parsePriceText(text: string | null | undefined): number | null {
  if (!text) return null;
  const match = text.replace(/,/g, "").match(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
