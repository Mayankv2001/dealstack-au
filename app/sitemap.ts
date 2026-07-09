import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";
import { getStores } from "@/lib/repos";

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

  const stores = await getStores();
  const storeRoutes: MetadataRoute.Sitemap = stores.map((store) => ({
    url: `${base}/stores/${store.id}`,
    changeFrequency: "daily",
  }));

  return [...staticRoutes, ...storeRoutes];
}
