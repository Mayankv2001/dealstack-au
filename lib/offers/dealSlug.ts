/**
 * Permalink slugs for weekly-deal detail pages (/deals/[slug]).
 *
 * Shape: "{title-slug}--{id}". The title part exists only for readability and
 * SEO — the id after the FIRST "--" is authoritative. slugifyDealTitle can
 * never emit consecutive hyphens, so the first "--" unambiguously separates
 * the two even though deal ids themselves contain single hyphens
 * (e.g. "wk-2026-06-08-jbhifi-stack").
 *
 * Pure string functions — no data access — so they are trivially testable and
 * safe to use from the sitemap, cards, and the route itself.
 */

const MAX_TITLE_SLUG_LENGTH = 60;

/** Lowercase, alphanumerics only, single-hyphen separated, length-capped. */
export function slugifyDealTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics left by NFKD
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TITLE_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

/** Canonical slug for a deal. Falls back to the bare id for empty titles. */
export function weeklyDealSlug(deal: { id: string; title: string }): string {
  const titlePart = slugifyDealTitle(deal.title);
  return titlePart ? `${titlePart}--${deal.id}` : deal.id;
}

/** Canonical route path for a deal detail page. */
export function weeklyDealPath(deal: { id: string; title: string }): string {
  return `/deals/${weeklyDealSlug(deal)}`;
}

/**
 * Extract the deal id from an incoming slug. Accepts both the canonical
 * "{title}--{id}" form and a bare id (the route redirects the latter to the
 * canonical URL once the deal is loaded).
 */
export function dealIdFromSlug(slug: string): string {
  const sep = slug.indexOf("--");
  return sep === -1 ? slug : slug.slice(sep + 2);
}
