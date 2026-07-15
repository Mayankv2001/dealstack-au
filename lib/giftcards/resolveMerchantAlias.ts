import type { Store } from "@/lib/data";
import {
  merchantAliasEntries,
  normaliseText,
} from "@/lib/sources/normalise";

export type MerchantResolutionState = "resolved" | "unresolved" | "ambiguous";

export interface MerchantAliasResolution {
  rawName: string;
  normalisedName: string;
  state: MerchantResolutionState;
  storeId: string | null;
  candidateStoreIds: string[];
  matchedAlias: string | null;
}

/**
 * Resolve only exact names and reviewed aliases. There is deliberately no
 * fuzzy fallback: a tie remains ambiguous and every result still requires
 * candidate review before publication.
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
  return {
    rawName,
    normalisedName,
    state:
      candidateStoreIds.length === 1
        ? "resolved"
        : candidateStoreIds.length > 1
          ? "ambiguous"
          : "unresolved",
    storeId: candidateStoreIds.length === 1 ? candidateStoreIds[0] : null,
    candidateStoreIds,
    matchedAlias: candidateStoreIds.length > 0 ? normalisedName : null,
  };
}

