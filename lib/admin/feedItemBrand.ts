/**
 * OzBargain RSS categories mix brands with product types, models, retailers,
 * campaigns and dimensions. Only exact entries or known-brand-prefixed model
 * tags from this conservative vocabulary (plus tags explicitly suffixed
 * "(Brand)") are treated as brands. Titles are deliberately not parsed.
 */
const CANONICAL_PRODUCT_BRANDS = [
  "Acer",
  "adidas",
  "Apple",
  "ASICS",
  "Bahco",
  "Bosch",
  "DeWALT",
  "Ecovacs",
  "EPOMAKER",
  "Epson",
  "Google",
  "Incipio",
  "Intel",
  "Jumbuck",
  "LEGO",
  "LG",
  "Mizuno",
  "New Balance",
  "Nike",
  "NZXT",
  "Omron",
  "Oral-B",
  "OtterBox",
  "Samsung",
  "Sally Hansen",
  "Sony",
  "TP-Link",
  "VT COSMETICS",
  "Xiaomi",
  "ZAGG",
] as const;

const BRAND_BY_FOLDED_NAME = new Map(
  CANONICAL_PRODUCT_BRANDS.map((brand) => [brand.toLocaleLowerCase("en-AU"), brand])
);
const EXPLICIT_BRAND_TAG = /^([A-Za-z0-9][A-Za-z0-9&.'+\-]*(?: [A-Za-z0-9][A-Za-z0-9&.'+\-]*)*) \(Brand\)$/i;

export function normaliseFeedBrandTag(tag: string): string | null {
  const clean = tag.trim();
  if (clean === "" || clean.length > 80) return null;
  const folded = clean.toLocaleLowerCase("en-AU");
  const canonical = BRAND_BY_FOLDED_NAME.get(folded);
  if (canonical) return canonical;
  const explicit = clean.match(EXPLICIT_BRAND_TAG)?.[1];
  if (explicit) return explicit;
  for (const [known, brand] of BRAND_BY_FOLDED_NAME) {
    if (folded.startsWith(`${known} `)) return brand;
  }
  return null;
}

/** Return every unambiguous brand tag on an item, deduped and sorted. */
export function detectFeedItemBrands(categories: readonly string[]): string[] {
  const brands = new Map<string, string>();
  for (const category of categories) {
    const brand = normaliseFeedBrandTag(category);
    if (brand) brands.set(brand.toLocaleLowerCase("en-AU"), brand);
  }
  return [...brands.values()].sort((a, b) => a.localeCompare(b, "en-AU"));
}
