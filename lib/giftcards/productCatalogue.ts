import type { GiftCardProduct } from "@/lib/offers/types";

export interface ProductFactRow {
  label: string;
  value: string;
  href?: string;
}

const titleCase = (value: string) =>
  value === "unknown" ? "Not recorded" : value.replaceAll("-", " ");

export const availabilityLabel = (value: boolean | null): string =>
  value == null ? "Not recorded" : value ? "Available" : "Not available";

export const formatDenominations = (product: GiftCardProduct): string => {
  if (product.denominations != null) {
    return product.denominations.length
      ? product.denominations.map((value) => `$${value}`).join(", ")
      : "No denominations recorded";
  }
  if (product.minDenomination != null && product.maxDenomination != null) {
    return `$${product.minDenomination}–$${product.maxDenomination}`;
  }
  return "Not recorded";
};

/** Public-safe facts: every absent value remains visibly unknown. */
export const productFactRows = (product: GiftCardProduct): ProductFactRow[] => [
  { label: "Issuer", value: product.issuer ?? "Not recorded" },
  { label: "Format", value: titleCase(product.format) },
  {
    label: "Network",
    value: product.cardNetwork == null ? "Not recorded" : titleCase(product.cardNetwork),
  },
  {
    label: "Variable load",
    value: product.variableLoad == null ? "Not recorded" : product.variableLoad ? "Yes" : "No",
  },
  { label: "Denominations", value: formatDenominations(product) },
  { label: "Online", value: availabilityLabel(product.onlineAvailable) },
  { label: "In store", value: availabilityLabel(product.inStoreAvailable) },
  { label: "Mobile wallet", value: titleCase(product.mobileWallet) },
  { label: "Split payment", value: titleCase(product.splitPayment) },
  { label: "Activation", value: product.activationMethod ?? "Not recorded" },
  {
    label: "Activation delay",
    value: product.activationDelayNote ?? "Not recorded",
  },
  { label: "Expiry or fees", value: product.expiryOrFeesNote ?? "Not recorded" },
  {
    label: "Aliases",
    value: product.aliases.length ? product.aliases.join(", ") : "Not recorded",
  },
  {
    label: "Official product page",
    value: product.officialProductPage ? "Open official page" : "Not recorded",
    href: product.officialProductPage ?? undefined,
  },
];

export const searchableProductText = (product: GiftCardProduct): string =>
  [
    product.brand,
    product.issuer,
    product.cardNetwork,
    product.format,
    ...product.aliases,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
