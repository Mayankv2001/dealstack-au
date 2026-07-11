import { parsePriceText } from "@/lib/offers/productPrice";

export const PRODUCT_GROUP_MAX_LENGTH = 80;

export const PRODUCT_GROUP_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Product groups are exact, admin-assigned kebab-case keys. */
export function isValidProductGroup(value: string): boolean {
  return (
    value.length <= PRODUCT_GROUP_MAX_LENGTH && PRODUCT_GROUP_PATTERN.test(value)
  );
}

export function parseProductGroup(
  value: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  const text = String(value ?? "").trim();
  if (text === "") return { ok: true, value: null };
  return isValidProductGroup(text)
    ? { ok: true, value: text }
    : { ok: false };
}

export function productGroupReadinessError({
  productGroup,
  merchantId,
  productUrl,
  priceText,
}: {
  productGroup: string | null;
  merchantId: string | null;
  productUrl: string | null;
  priceText: string | null;
}): string | null {
  if (!productGroup) return null;
  if (!merchantId) return "Choose a store before assigning a product group.";
  if (!productUrl) {
    return "Add the retailer's exact product URL before assigning a product group.";
  }
  if (parsePriceText(priceText) === null) {
    return "Add a parseable AUD price (for example, $1,799) before assigning a product group.";
  }
  return null;
}
