/**
 * Detects demo/placeholder wording left in published offer copy (e.g. the
 * "Illustrative sign-up bonus: …" text on the 5 live card_offers rows —
 * FINAL-LAUNCH-CHECKLIST.md §11). Pure and dependency-free: shared by the
 * admin data-quality report (lib/admin/repos/dashboard.ts) AND the
 * cleanup-old-deals CLI script, so it must never import getSupabaseAdmin
 * (browser-guarded) or anything else with a runtime/env dependency.
 */

/** Case-insensitive, word-bounded markers of demo/placeholder copy. Deliberately
 *  high-precision: every hit is a human review cost, so no bare "sample"/"example"
 *  (those appear in legitimate offer text, e.g. "free sample", "for example"). */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\billustrative\b/i,
  /\bplaceholder\b/i,
  /\blorem\b/i,
  /\bsample (data|figures?|offer|only)\b/i,
  /\bdemo (data|only|offer|row)\b/i,
  /\bexample only\b/i,
];

/** Returns the distinct matched marker snippets (empty array = clean). */
export function findPlaceholderMarkers(
  texts: ReadonlyArray<string | null | undefined>
): string[] {
  const joined = texts.filter((t): t is string => !!t).join("\n");
  const markers = new Set<string>();
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = joined.match(pattern);
    if (match) markers.add(match[0].toLowerCase());
  }
  return [...markers].sort();
}
