import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { weeklyDealPath } from "@/lib/offers/dealSlug";
import {
  getAllGiftCardProducts,
  getCardOffers,
  getCurrentReviewedGiftCardOffers,
  getStores,
} from "@/lib/repos";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { getWeeklyDeals } from "@/lib/repos/weeklyDeals";

/**
 * A `lastModified` only when a truthful timestamp exists — never fabricated.
 * `new Date` of an ISO/date string is deterministic and timezone-safe here.
 */
function truthfulLastModified(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Public routes only. Every dynamic family is built from the SAME expiry- and
 * publication-filtered repository loader the page itself renders from, so the
 * sitemap can never advertise a URL that 404s or an offer that has expired.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/deals",
    "/search",
    "/stores",
    "/cards",
    "/cards/compare",
    "/cashback",
    "/gift-cards",
    "/gift-cards/products",
    "/gift-cards/where-to-use",
    "/gift-cards/where-to-buy",
    "/gift-cards/history",
    "/gift-cards/programmes",
    "/gift-cards/weekly",
    "/gift-cards/weekly/plan",
    "/rewards",
    "/resources",
    "/privacy",
    "/terms",
    "/editorial-policy",
  ].map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "daily",
  }));

  const [stores, weeklyDeals, giftCardProducts, giftCardOffers, cardOffers] =
    await Promise.all([
      getStores(),
      getWeeklyDeals(),
      getAllGiftCardProducts(),
      getCurrentReviewedGiftCardOffers(),
      getCardOffers(),
    ]);
  const storeRoutes: MetadataRoute.Sitemap = stores.map((store) => ({
    url: `${base}/stores/${store.id}`,
    changeFrequency: "daily",
  }));
  // Live deals only (getWeeklyDeals is expiry-filtered) — expired permalinks
  // still render for inbound links, but we do not advertise them.
  const dealRoutes: MetadataRoute.Sitemap = weeklyDeals.map((deal) => ({
    url: `${base}${weeklyDealPath(deal)}`,
    changeFrequency: "daily",
  }));

  const productRoutes: MetadataRoute.Sitemap = giftCardProducts.map((product) => ({
    url: `${base}/gift-cards/products/${product.slug}`,
    changeFrequency: "weekly",
  }));
  // Published, non-expired reviewed gift-card offers — the exact set /gift-cards
  // renders. lastCheckedAt is a real editorial-freshness timestamp.
  const giftCardOfferRoutes: MetadataRoute.Sitemap = giftCardOffers.map(
    (offer) => ({
      url: `${base}/gift-cards/${offer.id}`,
      lastModified: truthfulLastModified(offer.lastCheckedAt),
      changeFrequency: "daily",
    }),
  );
  // Public-ready card offers — same RLS/readiness gate as /cards and /cards/[id].
  const cardOfferRoutes: MetadataRoute.Sitemap = cardOffers.map((offer) => ({
    url: `${base}/cards/${offer.id}`,
    lastModified: truthfulLastModified(offer.lastCheckedAt),
    changeFrequency: "daily",
  }));
  const rewardsRoutes: MetadataRoute.Sitemap = REWARDS_PROGRAMMES.map((programme) => ({
    url: `${base}/rewards/${programme.slug}`,
    changeFrequency: "daily",
  }));

  return [
    ...staticRoutes,
    ...storeRoutes,
    ...dealRoutes,
    ...productRoutes,
    ...giftCardOfferRoutes,
    ...cardOfferRoutes,
    ...rewardsRoutes,
  ];
}
