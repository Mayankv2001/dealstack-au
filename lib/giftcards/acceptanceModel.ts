import type {
  GiftCardAcceptanceRow,
  GiftCardOffer,
  GiftCardProduct,
} from "@/lib/offers/types";

/**
 * Per-product acceptance view model for the "Where each card works" section.
 * Composes ONLY approved structured rows (products, published acceptance
 * facts, the offer's own retailer lists) — no source prose. Acceptance is
 * never presented as guaranteed: the MCC_DISCLAIMER accompanies every list.
 */

export const MCC_DISCLAIMER =
  "Acceptance depends on the merchant category code assigned to the transaction. Verify before purchase.";

export const ACCEPTANCE_STATUS_LABEL: Record<
  GiftCardAcceptanceRow["status"],
  string
> = {
  verified: "Verified",
  claimed: "Claimed by issuer",
  community: "Community-reported",
};

export interface ProductAcceptanceView {
  product: GiftCardProduct | null;
  /** Product id (present even when the product row itself is not activated). */
  productId: string;
  /** Display heading — product brand, or the offer brand as fallback. */
  title: string;
  /** Accepted merchants (verified/claimed/community, successful or untested). */
  merchants: GiftCardAcceptanceRow[];
  /** Merchants recorded as NOT working. */
  rejectedMerchants: GiftCardAcceptanceRow[];
  /** Distinct accepted merchant categories, from the acceptance evidence. */
  categories: string[];
  supportedMccs: number[];
  unsupportedMccs: number[];
  /** ISO timestamp of the freshest acceptance check, if any. */
  lastCheckedAt: string | null;
}

/** Offer + activated products + published acceptance → per-product views. */
export function buildProductAcceptance(
  offer: GiftCardOffer,
  products: GiftCardProduct[],
  acceptance: GiftCardAcceptanceRow[]
): ProductAcceptanceView[] {
  const productIds = [
    ...new Set(
      [offer.productId, ...(offer.includedProductIds ?? [])].filter(
        (id): id is string => Boolean(id)
      )
    ),
  ];
  const productById = new Map(products.map((p) => [p.id, p]));

  return productIds.map((productId) => {
    const product = productById.get(productId) ?? null;
    const rows = acceptance.filter((row) => row.productId === productId);
    const merchants = rows.filter((row) => row.outcome !== "unsuccessful");
    const rejectedMerchants = rows.filter((row) => row.outcome === "unsuccessful");
    const categories = [
      ...new Set(
        rows
          .map((row) => row.merchantCategory?.trim())
          .filter((c): c is string => Boolean(c))
      ),
    ].sort();
    const lastCheckedAt =
      rows
        .map((row) => row.checkedAt)
        .filter((c): c is string => Boolean(c))
        .sort()
        .at(-1) ?? null;
    return {
      product,
      productId,
      title: product?.brand ?? offer.brand,
      merchants,
      rejectedMerchants,
      categories,
      supportedMccs: product?.supportedMccs ?? [],
      unsupportedMccs: product?.unsupportedMccs ?? [],
      lastCheckedAt,
    };
  });
}
