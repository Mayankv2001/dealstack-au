import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { weeklyDealPath } from "@/lib/offers/dealSlug";
import { getAllGiftCardProducts, getStores } from "@/lib/repos";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { getWeeklyDeals } from "@/lib/repos/weeklyDeals";

/**
 * Public routes only. Store pages come from the repository layer (Supabase
 * when configured, static fallback otherwise) — the same list the site
 * renders, so the sitemap never links a page that would 404.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/deals",
    "/search",
    "/stores",
    "/cards",
    "/cashback",
    "/gift-cards",
    "/gift-cards/products",
    "/gift-cards/where-to-use",
    "/gift-cards/where-to-buy",
    "/gift-cards/history",
    "/gift-cards/programmes",
    "/gift-cards/weekly",
    "/rewards",
    "/resources",
    "/privacy",
    "/terms",
    "/editorial-policy",
  ].map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "daily",
  }));

  const [stores, weeklyDeals, giftCardProducts] = await Promise.all([
    getStores(),
    getWeeklyDeals(),
    getAllGiftCardProducts(),
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
  const rewardsRoutes: MetadataRoute.Sitemap = REWARDS_PROGRAMMES.map((programme) => ({
    url: `${base}/rewards/${programme.slug}`,
    changeFrequency: "daily",
  }));

  return [
    ...staticRoutes,
    ...storeRoutes,
    ...dealRoutes,
    ...productRoutes,
    ...rewardsRoutes,
  ];
}
