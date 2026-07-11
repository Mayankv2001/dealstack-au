import type { FeedQueueItem } from "@/lib/admin/repos/feedQueue";
import type { Relevance } from "@/lib/admin/queueRelevance";
import { isExpiringSoonAU } from "@/lib/offers/expiry";

export const NO_BRAND_FILTER = "__no_brand__";

export interface FeedQueueFilters {
  source: string;
  brand: string;
  store: string;
  query: string;
  category: string;
  cashbackProvider: string;
  expiringSoon: boolean;
  presets: readonly string[];
  relevance: Relevance | "";
}

export function feedQueueBrandOptions(items: readonly FeedQueueItem[]): string[] {
  const brands = new Map<string, string>();
  for (const item of items) {
    for (const brand of item.metadata.brands) {
      brands.set(brand.toLocaleLowerCase("en-AU"), brand);
    }
  }
  return [...brands.values()].sort((a, b) => a.localeCompare(b, "en-AU"));
}

/** Apply every queue filter as one AND-composed predicate. */
export function filterFeedQueueItems(
  items: readonly FeedQueueItem[],
  filters: FeedQueueFilters,
  relevanceById: ReadonlyMap<string, { relevance: Relevance }>
): FeedQueueItem[] {
  const q = filters.query.trim().toLocaleLowerCase("en-AU");
  const category = filters.category.trim().toLocaleLowerCase("en-AU");
  const activePresets = filters.presets.map((preset) =>
    preset.toLocaleLowerCase("en-AU")
  );
  const brand = filters.brand.toLocaleLowerCase("en-AU");

  return items.filter((item) => {
    if (filters.source && item.feedSourceId !== filters.source) return false;
    if (filters.store && item.metadata.merchantId !== filters.store) return false;
    if (filters.brand === NO_BRAND_FILTER && item.metadata.brands.length > 0) {
      return false;
    }
    if (
      filters.brand &&
      filters.brand !== NO_BRAND_FILTER &&
      !item.metadata.brands.some(
        (itemBrand) => itemBrand.toLocaleLowerCase("en-AU") === brand
      )
    ) {
      return false;
    }
    if (
      filters.cashbackProvider &&
      item.metadata.cashbackProvider !== filters.cashbackProvider
    ) {
      return false;
    }
    if (filters.expiringSoon && !isExpiringSoonAU(item.metadata.expiryDate)) {
      return false;
    }
    if (
      q &&
      !`${item.rawTitle} ${item.rawSummary}`
        .toLocaleLowerCase("en-AU")
        .includes(q)
    ) {
      return false;
    }
    if (
      category &&
      !item.categories.some((value) =>
        value.toLocaleLowerCase("en-AU").includes(category)
      )
    ) {
      return false;
    }
    if (activePresets.length > 0) {
      const haystack = `${item.rawTitle} ${item.rawSummary} ${item.categories.join(" ")}`
        .toLocaleLowerCase("en-AU");
      if (!activePresets.some((preset) => haystack.includes(preset))) return false;
    }
    if (
      filters.relevance &&
      relevanceById.get(item.id)?.relevance !== filters.relevance
    ) {
      return false;
    }
    return true;
  });
}

/** IDs that a select-all operation is allowed to pass to a bulk action. */
export function feedQueueSelectionIds(
  items: readonly FeedQueueItem[],
  cap: number
): string[] {
  return items.slice(0, Math.max(0, cap)).map((item) => item.id);
}
