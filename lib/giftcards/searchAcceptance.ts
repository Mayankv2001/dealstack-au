import type { GiftCardAcceptanceRow, GiftCardProduct } from "@/lib/offers/types";
import type { Store } from "@/lib/data";
import {
  deriveAcceptanceFreshness,
  isPositiveAcceptance,
  type AcceptanceFreshness,
} from "./acceptanceModel";
import { resolveMerchantAlias } from "./resolveMerchantAlias";

export interface AcceptanceSearchResult {
  product: GiftCardProduct;
  row: GiftCardAcceptanceRow;
  freshness: AcceptanceFreshness;
}

/**
 * Bidirectional public lookup used by the page and tests. Only rows whose
 * product is in the public product set can be returned.
 */
export function searchGiftCardAcceptance(
  products: GiftCardProduct[],
  acceptance: GiftCardAcceptanceRow[],
  query: string,
  now: Date = new Date(),
  stores: Array<Pick<Store, "id" | "name" | "aliases">> = [],
): AcceptanceSearchResult[] {
  const needle = query.trim().toLocaleLowerCase("en-AU");
  const merchantResolution = needle
    ? resolveMerchantAlias(query, stores)
    : null;
  const byId = new Map(products.map((product) => [product.id, product]));

  return acceptance.flatMap((row) => {
    const product = byId.get(row.productId);
    if (!product) return [];
    if (!isPositiveAcceptance(row)) return [];
    const haystack = [
      product.brand,
      product.issuer,
      row.merchantName,
      row.merchantCategory,
      row.storeId,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-AU");
    const matchesResolvedMerchant =
      merchantResolution?.state === "resolved" &&
      row.storeId === merchantResolution.storeId;
    return !needle || haystack.includes(needle) || matchesResolvedMerchant
      ? [{ product, row, freshness: deriveAcceptanceFreshness(row, now) }]
      : [];
  });
}
