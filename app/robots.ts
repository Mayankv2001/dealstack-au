import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/env";

/** Crawl rules: public pages open, admin panel and API routes excluded. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
