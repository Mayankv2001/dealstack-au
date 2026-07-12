/**
 * Pure approval-safeguard helpers — the detectors behind the material-field
 * gate in approvalValidation.ts. Each is deterministic and unit-tested so the
 * review action stays thin. These encode the lessons from the 2026-07 audit:
 *   - a source page with many distinct brands is usually a COMPOUND campaign
 *     (multiple sub-offers) and must not be published as one broad offer;
 *   - a Prime / member-only source must carry the membership flag;
 *   - a spend-threshold ("$100+") offer must record its minimum spend, so a
 *     fixed-dollar / promo-credit deal is never shown without its condition.
 */

/** Split the stored comma-list into trimmed brand names (never splits on "&"). */
export function splitBrandList(brand: string): string[] {
  return brand
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Above this many distinct included brands, a single source item is treated as
 * a compound campaign: the reviewer must split it, or consciously confirm it is
 * one coherent offer. Tuned so a real bundle (4–5 TCN cards) passes but a
 * 33-brand catalogue dump does not.
 */
export const COMPOUND_BRAND_THRESHOLD = 8;

export interface CompoundAssessment {
  isCompound: boolean;
  brandCount: number;
  reason: string;
}

export function assessCompoundCampaign(brand: string): CompoundAssessment {
  const brands = splitBrandList(brand);
  const brandCount = brands.length;
  const isCompound = brandCount > COMPOUND_BRAND_THRESHOLD;
  return {
    isCompound,
    brandCount,
    reason: isCompound
      ? `This source lists ${brandCount} distinct brands — that is usually a compound campaign with several sub-offers, not one offer.`
      : "",
  };
}

/**
 * Signals that an offer is Prime / member-only and therefore needs the
 * membership flag. Matches whole words so a plain seller like "Amazon" or
 * "Woolworths" is not caught, but "RACV Member Benefits portal", "NRMA Blue
 * member portal" or an "Amazon Prime" source is.
 */
const MEMBERSHIP_PATTERNS: RegExp[] = [
  /\bprime\b/i,
  /\bmembers?\b/i,
  /\bmembership\b/i,
  /member(?:s)?[-\s]?(?:only|portal|benefit|benefits)/i,
];

export function detectMembershipSignal(...parts: (string | null | undefined)[]): string | null {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return null;
  for (const pattern of MEMBERSHIP_PATTERNS) {
    if (pattern.test(text)) {
      return "The seller or source describes a Prime / member-only offer.";
    }
  }
  return null;
}

/**
 * Detects a stated spend threshold ("$100+", "spend $50", "when you buy $100",
 * "min. spend $30"). Used to require a recorded minimum spend for fixed-dollar
 * / promo-credit style offers so the condition is never hidden.
 */
const THRESHOLD_PATTERNS: RegExp[] = [
  /\$\s?\d[\d,]*\s*\+/, // "$100+"
  /\bspend\b[^.]*\$\s?\d/i, // "spend ... $100"
  /\bwhen you (?:buy|spend)\b[^.]*\$\s?\d/i, // "when you buy $100+"
  /\bmin(?:imum)?\.?\s*spend\b[^.]*\$\s?\d/i, // "min spend $30"
];

export function detectSpendThreshold(...parts: (string | null | undefined)[]): boolean {
  const text = parts.filter(Boolean).join(" ");
  if (!text.trim()) return false;
  return THRESHOLD_PATTERNS.some((pattern) => pattern.test(text));
}
