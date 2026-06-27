import { stores } from "@/lib/data";
import type { Confidence, DealSourceResult } from "./types";

/** Lowercase, collapse all non-alphanumerics to single spaces */
export function normaliseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Aliases (normalised form) → Store.id from lib/data.ts.
 * Store names and ids themselves are added automatically below.
 */
const MERCHANT_ALIASES: Record<string, string[]> = {
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

export function isExpired(result: DealSourceResult, now: Date): boolean {
  if (!result.expiryDate) return false;
  // Expiry is inclusive of the stated day (AU offers usually end at midnight)
  return new Date(`${result.expiryDate}T23:59:59+10:00`).getTime() < now.getTime();
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
