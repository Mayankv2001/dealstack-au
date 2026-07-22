import type { Store } from "@/lib/data";
import {
  boundedOsaDistance,
  merchantAliasEntries,
  normaliseText,
} from "@/lib/sources/normalise";

export type MerchantResolutionState = "resolved" | "unresolved" | "ambiguous";

/** How a resolution was reached: an exact name/alias hit, or a bounded typo-tolerant near-match. */
export type MerchantResolutionMethod = "exact" | "near-match";

export interface MerchantAliasResolution {
  rawName: string;
  normalisedName: string;
  state: MerchantResolutionState;
  storeId: string | null;
  candidateStoreIds: string[];
  matchedAlias: string | null;
  method: MerchantResolutionMethod;
}

/**
 * Minimum length (query and alias) eligible for the near-match fallback. Below
 * this a single edit is too large a fraction of the string to trust.
 */
const NEAR_MATCH_MIN_LEN = 4;
/** Sanity cap on query length before the distance loop (no DoS surface). */
const NEAR_MATCH_MAX_LEN = 64;

/**
 * Resolve exact names and reviewed aliases first; only when nothing resolves
 * exactly, fall back to a bounded, typo-tolerant near-match (edit-distance ≤ 1,
 * or ≤ 2 once either side is ≥ 6 chars) against the SAME alias table. An exact
 * hit therefore always wins. A near-match resolves ONLY to a unique store at the
 * single smallest distance; two different stores tied at that distance resolve
 * to nothing (state "unresolved") rather than guessing — the caller then shows
 * its zero-hit recovery. Every result still requires candidate review before
 * publication; this only affects which store a *search* lands on.
 */
export function resolveMerchantAlias(
  rawName: string,
  stores: Array<Pick<Store, "id" | "name" | "aliases">>,
): MerchantAliasResolution {
  const normalisedName = normaliseText(rawName);
  if (!normalisedName) {
    return {
      rawName,
      normalisedName,
      state: "unresolved",
      storeId: null,
      candidateStoreIds: [],
      matchedAlias: null,
      method: "exact",
    };
  }

  const knownIds = new Set(stores.map((store) => store.id));
  const aliases = new Map<string, Set<string>>();
  const add = (alias: string, storeId: string) => {
    const key = normaliseText(alias);
    if (!key || !knownIds.has(storeId)) return;
    const ids = aliases.get(key) ?? new Set<string>();
    ids.add(storeId);
    aliases.set(key, ids);
  };
  for (const store of stores) {
    add(store.id, store.id);
    add(store.name, store.id);
    for (const alias of store.aliases ?? []) add(alias, store.id);
  }
  for (const [alias, storeId] of merchantAliasEntries()) add(alias, storeId);

  const candidateStoreIds = [...(aliases.get(normalisedName) ?? [])].sort();
  if (candidateStoreIds.length > 0) {
    return {
      rawName,
      normalisedName,
      state: candidateStoreIds.length === 1 ? "resolved" : "ambiguous",
      storeId: candidateStoreIds.length === 1 ? candidateStoreIds[0] : null,
      candidateStoreIds,
      matchedAlias: normalisedName,
      method: "exact",
    };
  }

  const nearMatch = resolveNearMatch(normalisedName, aliases);
  if (nearMatch) {
    return {
      rawName,
      normalisedName,
      state: "resolved",
      storeId: nearMatch.storeId,
      candidateStoreIds: [nearMatch.storeId],
      matchedAlias: nearMatch.alias,
      method: "near-match",
    };
  }

  return {
    rawName,
    normalisedName,
    state: "unresolved",
    storeId: null,
    candidateStoreIds: [],
    matchedAlias: null,
    method: "exact",
  };
}

/**
 * Bounded near-match over the alias table. Returns the unique store at the
 * single smallest in-threshold edit distance, or null when nothing is close
 * enough or when two different stores tie at that smallest distance.
 */
function resolveNearMatch(
  normalisedName: string,
  aliases: Map<string, Set<string>>,
): { storeId: string; alias: string } | null {
  if (
    normalisedName.length < NEAR_MATCH_MIN_LEN ||
    normalisedName.length > NEAR_MATCH_MAX_LEN
  ) {
    return null;
  }
  let bestDistance = Infinity;
  let bestStoreIds = new Set<string>();
  let bestAlias: string | null = null;
  for (const [alias, ids] of aliases) {
    if (alias.length < NEAR_MATCH_MIN_LEN) continue;
    const threshold =
      Math.max(normalisedName.length, alias.length) >= 6 ? 2 : 1;
    const distance = boundedOsaDistance(normalisedName, alias, threshold);
    if (distance > threshold) continue;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestStoreIds = new Set(ids);
      bestAlias = alias;
    } else if (distance === bestDistance) {
      for (const id of ids) bestStoreIds.add(id);
    }
  }
  if (bestDistance === Infinity || bestStoreIds.size !== 1) return null;
  return { storeId: [...bestStoreIds][0], alias: bestAlias! };
}

