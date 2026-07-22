/**
 * Pure JSON-LD builders for site-level structured data.
 *
 * No I/O and no framework imports — every builder is a pure function of its
 * arguments, so they are trivially unit-testable. Callers pass the absolute
 * site origin (from `siteUrl()` in lib/env.ts); schema.org has no
 * `metadataBase` concept, so every URL emitted here must be absolute.
 *
 * DELIBERATELY navigational only: WebSite, Organization, BreadcrumbList and
 * ItemList — all facts about *our own site* and how it links together. There is
 * intentionally NO Offer / Product / AggregateOffer markup. Deal data here is
 * third-party, admin-transcribed, expiry-prone and framed sitewide as "verify
 * before you buy"; asserting it as schema.org price/availability facts invites
 * rich results Google treats as spammy structured data (manual-action
 * territory). ItemList is safe because it asserts only "this listing page links
 * to these internal pages in this order" — a name and a URL, never a price,
 * availability or rating. This is a scope wall, not an oversight — do not add
 * product/offer schema here.
 */

const SITE_NAME = "DealStack AU";

/** Drop any trailing slash(es) so `${base}/path` never doubles up. */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * schema.org WebSite for the homepage, including a SearchAction that wires up
 * the Google sitelinks search box. The target must match the real search route:
 * `app/search/page.tsx` reads the `q` query param, so the template uses `?q=`.
 * The `query-input` string is the exact, fixed value schema.org requires.
 */
export function buildWebSiteJsonLd(siteUrl: string): Record<string, unknown> {
  const base = trimTrailingSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: base,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * schema.org Organization for the site. Only properties we have real values for
 * are included — deliberately no `logo` until an actual logo asset exists (an
 * OG image is not a logo, and a fake/broken logo URL is worse than none).
 */
export function buildOrganizationJsonLd(
  siteUrl: string
): Record<string, unknown> {
  const base = trimTrailingSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: base,
  };
}

/**
 * schema.org BreadcrumbList for a store page: Home → <store name>. Only TWO
 * levels: there is no `/stores` index route (only `/stores/[slug]`), so a
 * "Stores" crumb would link a 404 that schema validators and Googlebot would
 * follow. Both `item` URLs are absolute.
 */
export function buildStoreBreadcrumbJsonLd(
  siteUrl: string,
  store: { id: string; name: string }
): Record<string, unknown> {
  const base = trimTrailingSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: base,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: store.name,
        item: `${base}/stores/${store.id}`,
      },
    ],
  };
}

/**
 * schema.org BreadcrumbList for a deal detail page: Home → Weekly Deals →
 * <deal title>. Three levels are safe here (unlike stores) because /deals is
 * a real index route. Both `item` URLs are absolute. NOTE: breadcrumbs only —
 * the no-Offer/Product scope wall in this file's header applies to deal pages
 * too.
 */
export function buildDealBreadcrumbJsonLd(
  siteUrl: string,
  deal: { title: string; path: string }
): Record<string, unknown> {
  const base = trimTrailingSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: base },
      {
        "@type": "ListItem",
        position: 2,
        name: "Weekly Deals",
        item: `${base}/deals`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: deal.title,
        item: `${base}${deal.path}`,
      },
    ],
  };
}

/**
 * Absolutise a listing URL under the site origin. Accepts a site-relative path
 * ("/stores/myer") or an already-absolute http(s) URL; schema.org has no
 * `metadataBase`, so every emitted `item` must be absolute.
 */
function absolutiseUrl(base: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
}

/**
 * schema.org ItemList for a listing page (/deals, /stores, /gift-cards).
 * Navigational structured data ONLY: each element is a ListItem pointing at one
 * of OUR OWN detail pages by name + absolute URL, in the order the page renders
 * them. See this file's header — this is NOT the forbidden Offer/Product markup;
 * no price, availability or rating is asserted.
 *
 * Callers pass items already filtered to what the page renders (published,
 * expiry-filtered) and in render order. Positions are 1-based and contiguous.
 * Items with an empty name or url are dropped; an empty list returns `null` so
 * the caller omits the `<script>` entirely rather than emit a hollow ItemList
 * (which validators flag).
 */
export function buildItemListJsonLd(
  siteUrl: string,
  items: ReadonlyArray<{ name: string; url: string }>,
): Record<string, unknown> | null {
  const base = trimTrailingSlash(siteUrl);
  const cleaned = items
    .map((item) => ({ name: item.name.trim(), url: item.url.trim() }))
    .filter((item) => item.name !== "" && item.url !== "");
  if (cleaned.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: cleaned.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absolutiseUrl(base, item.url),
    })),
  };
}

/**
 * Serialize a JSON-LD object for embedding inside a
 * `<script type="application/ld+json">` tag.
 *
 * JSON is NOT HTML: `JSON.stringify` does not escape `<`, so a value containing
 * `</script>` (e.g. an admin-entered store name flowing into the breadcrumb
 * builder) would terminate the script tag early and inject arbitrary markup.
 * Escaping `<` as `<` closes that hole and is JSON-valid — the output
 * still round-trips through `JSON.parse`. Mandatory, not cosmetic.
 */
export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
