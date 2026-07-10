import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { weeklyDealPath } from "@/lib/offers/dealSlug";
import { getStores } from "@/lib/repos";
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
    "/resources",
  ].map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "daily",
  }));

  const [stores, weeklyDeals] = await Promise.all([
    getStores(),
    getWeeklyDeals(),
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

  return [...staticRoutes, ...storeRoutes, ...dealRoutes];
}
