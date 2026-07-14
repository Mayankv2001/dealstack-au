import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import TopDealsSection from "@/components/TopDealsSection";
import SiteHeader from "@/components/SiteHeader";
import HomeSearchSections from "@/components/home/HomeSearchSections";
import {
  CalculatorSection,
  FinalCTASection,
  HomeFooter,
  SavingsLayersSection,
  TrustSection,
} from "@/components/home/HomeStaticSections";
import { siteUrl } from "@/lib/env";
import { getTopDeals } from "@/lib/repos/topDeals";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import { partitionStacks } from "@/lib/stack/present";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structuredData";

export const metadata: Metadata = {
  title: "DealStack AU — Stack cashback, gift cards & points at Australian stores",
  description:
    "See the best way to stack discount codes, cashback, discounted gift cards and points at popular Australian retailers — plus admin-reviewed OzBargain deal signals.",
};

/**
 * Homepage — server component. Loads stores from the repository layer
 * (Supabase when configured, static fallback otherwise), derives the featured
 * stack, and composes the page from server-rendered sections around three
 * small client islands (nav menu, hero-search + stores grid, worked-example
 * toggle) — see components/home/. getStores() itself swallows DB failures and
 * missing env and returns the static `stores` array, so the page always
 * renders.
 */

// ISR: serve cached HTML and refresh stores from the DB periodically, matching
// the /deals route's cadence.
export const revalidate = 300;

export default async function Home() {
  const now = new Date();
  const [data, topDeals] = await Promise.all([loadStackData(), getTopDeals()]);
  const recommendations = buildStackRecommendations(undefined, 500, data, now);
  const { best } = partitionStacks(recommendations);
  const featured = best[0] ?? null;
  const heroStack =
    best.find((recommendation) => recommendation.merchantId === "myer") ??
    featured;
  const site = siteUrl();

  return (
    <>
      <JsonLd data={buildWebSiteJsonLd(site)} />
      <JsonLd data={buildOrganizationJsonLd(site)} />
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main>
          <HomeSearchSections
            stores={data.stores}
            recommendations={recommendations}
            heroStack={heroStack}
            todayFeed={<TopDealsSection deals={topDeals.slice(0, 5)} />}
          />

          <SavingsLayersSection />
          <CalculatorSection
            recommendations={recommendations}
          />
          <TrustSection recommendation={featured} />
          <FinalCTASection />
        </main>
        <HomeFooter />
      </div>
    </>
  );
}
