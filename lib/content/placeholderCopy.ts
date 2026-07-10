/**
 * Pure placeholder-copy detection shared by public trust gates, admin reports,
 * and cleanup scripts. Keep this module free of database and environment code.
 */

// High-precision markers only: bare "sample" and "example" occur in legitimate
// copy and would create noisy false positives.
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\billustrative\b/i,
  /\bplaceholder\b/i,
  /\blorem\b/i,
  /\bsample (data|figures?|offer|only)\b/i,
  /\bdemo (data|only|offer|row)\b/i,
  /\bexample only\b/i,
];

/** Returns distinct matched marker snippets in stable order. */
export function findPlaceholderMarkers(
  texts: ReadonlyArray<string | null | undefined>
): string[] {
  const copy = texts.filter((text): text is string => Boolean(text)).join("\n");
  const markers = new Set<string>();

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = copy.match(pattern);
    if (match) markers.add(match[0].toLowerCase());
  }

  return [...markers].sort();
}
