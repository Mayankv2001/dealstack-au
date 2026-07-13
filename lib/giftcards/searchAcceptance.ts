import type { GiftCardAcceptanceRow, GiftCardProduct } from "@/lib/offers/types";

export interface AcceptanceSearchResult {
  product: GiftCardProduct;
  row: GiftCardAcceptanceRow;
}

/**
 * Bidirectional public lookup used by the page and tests. Only rows whose
 * product is in the public product set can be returned.
 */
export function searchGiftCardAcceptance(
  products: GiftCardProduct[],
  acceptance: GiftCardAcceptanceRow[],
  query: string
): AcceptanceSearchResult[] {
  const needle = query.trim().toLocaleLowerCase("en-AU");
  const byId = new Map(products.map((product) => [product.id, product]));

  return acceptance.flatMap((row) => {
    const product = byId.get(row.productId);
    if (!product) return [];
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
    return !needle || haystack.includes(needle) ? [{ product, row }] : [];
  });
}
