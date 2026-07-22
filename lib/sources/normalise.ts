import { stores } from "@/lib/data";
import type { Store } from "@/lib/data";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import type { Confidence, DealSourceResult } from "./types";

/** Lowercase, collapse all non-alphanumerics to single spaces */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Optimal String Alignment distance (Levenshtein plus adjacent transpositions),
 * bounded by `max`: returns `max + 1` immediately when the strings are too far
 * apart to be within the bound (length gap alone exceeds it) and never reports a
 * distance greater than `max + 1`. Transposition-aware on purpose — the common
 * store-name typo is a swap ("myre" for "myer"), which plain Levenshtein scores
 * as two substitutions but OSA scores as one. Pure and length-bounded, so it is
 * safe to run over a query against a fixed alias table (no DoS surface). Inputs
 * are expected pre-normalised and short; callers cap query length before use.
 */
export function boundedOsaDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > max) return max + 1;
  if (al === 0) return bl <= max ? bl : max + 1;
  if (bl === 0) return al <= max ? al : max + 1;

  let prevPrev = new Array<number>(bl + 1).fill(0);
  let prev = new Array<number>(bl + 1);
  let curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        v = Math.min(v, prevPrev[j - 2] + 1); // adjacent transposition
      }
      curr[j] = v;
    }
    // Rotate the three rolling rows (reuse the arrays, no per-row allocation).
    const spare = prevPrev;
    prevPrev = prev;
    prev = curr;
    curr = spare;
  }
  return prev[bl] <= max ? prev[bl] : max + 1;
}

/**
 * Aliases (normalised form) → Store.id from lib/data.ts.
 * Store names and ids themselves are added automatically below.
 */
export const MERCHANT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "jb-hifi": ["jb hifi", "jb hi fi", "jbhifi", "jb"],
  "chemist-warehouse": ["chemist warehouse", "cw", "chemist"],
  woolworths: ["woolies", "woolworths", "wish"],
  "amazon-au": ["amazon", "amazon au", "amazon australia"],
  "the-good-guys": ["the good guys", "good guys", "tgg"],
  myer: ["myer"],
  coles: ["coles", "coles group"],
  kogan: ["kogan"],
  costco: ["costco", "costco wholesale", "costco au"],
};

/** alias (normalised) → store id, longest aliases first for substring matching */
const aliasLookup: [alias: string, storeId: string][] = (() => {
  const entries = new Map<string, string>();
  for (const store of stores) {
    entries.set(normaliseText(store.name), store.id);
    entries.set(normaliseText(store.id), store.id);
  }
  for (const [storeId, aliases] of Object.entries(MERCHANT_ALIASES)) {
    for (const alias of aliases) entries.set(normaliseText(alias), storeId);
  }
  return [...entries.entries()].sort((a, b) => b[0].length - a[0].length);
})();

/** Reviewed static alias entries for exact resolvers; returned as a copy. */
export function merchantAliasEntries(): Array<[
  alias: string,
  storeId: string,
]> {
  return aliasLookup.map(([alias, storeId]) => [alias, storeId]);
}

/** Exact match of a merchant name/alias → Store.id */
export function matchMerchantId(name: string): string | null {
  const normalised = normaliseText(name);
  for (const [alias, storeId] of aliasLookup) {
    if (alias === normalised) return storeId;
  }
  return null;
}

/**
 * Find a known merchant mentioned anywhere inside free text
 * (e.g. a search query like "jb hifi tv deals" → "jb-hifi").
 * Longer aliases win; aliases under 3 chars must match a whole word.
 */
export function findMerchantIdInText(text: string): string | null {
  const normalised = ` ${normaliseText(text)} `;
  for (const [alias, storeId] of aliasLookup) {
    if (alias.length < 3) {
      if (normalised.includes(` ${alias} `)) return storeId;
    } else if (normalised.includes(alias)) {
      return storeId;
    }
  }
  return null;
}

/**
 * Zero-hit "did you mean" suggestions: up to `limit` stores whose name or a
 * reviewed alias is closest to the query by bounded OSA distance, nearest first.
 * Deliberately more lenient than the exact-resolve near-match in
 * `resolveMerchantAlias` (threshold 2, or 3 once the query is ≥ 6 chars), so it
 * surfaces onward links precisely when auto-resolution declined (too far, or an
 * ambiguous tie). Built only from the trusted store list, never the raw query.
 */
export function suggestNearbyStores(
  query: string,
  stores: Array<Pick<Store, "id" | "name" | "aliases">>,
  limit = 3,
): Array<{ id: string; name: string }> {
  const q = normaliseText(query);
  if (q.length < 4 || q.length > 64) return [];
  const threshold = q.length >= 6 ? 3 : 2;
  const scored: Array<{ id: string; name: string; distance: number }> = [];
  for (const store of stores) {
    const candidates = [store.name, ...(store.aliases ?? [])]
      .map(normaliseText)
      .filter(Boolean);
    let best = Infinity;
    for (const candidate of candidates) {
      const distance = boundedOsaDistance(q, candidate, threshold);
      if (distance < best) best = distance;
    }
    if (best <= threshold) {
      scored.push({ id: store.id, name: store.name, distance: best });
    }
  }
  scored.sort(
    (a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "en-AU"),
  );
  return scored.slice(0, limit).map(({ id, name }) => ({ id, name }));
}

export function isExpired(result: DealSourceResult, now: Date): boolean {
  // Inclusive of the stated day, by AU-local calendar date (Australia/Sydney,
  // DST-correct) — same convention as the public read guard in lib/offers/expiry.
  return isPastExpiry(result.expiryDate, todayAU(now));
}

/**
 * Display confidence, derived at read time so items degrade automatically:
 * past expiry always wins over whatever was stored.
 */
export function deriveConfidence(
  result: DealSourceResult,
  now: Date
): Confidence {
  if (isExpired(result, now)) return "expired-unknown";
  return result.confidence;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-06-30" or "2026-06-30T…" → "30 Jun 2026". Deterministic, no Date/timezone involved. */
export function formatDateAU(iso: string | null): string | null {
  if (!iso) return null;
  const [datePart] = iso.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
