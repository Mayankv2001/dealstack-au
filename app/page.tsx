import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import TopDealsSection from "@/components/TopDealsSection";
import { pickFeaturedStack } from "@/components/home/featured";
import HomeNav from "@/components/home/HomeNav";
import HomeSearchSections from "@/components/home/HomeSearchSections";
import {
  CalculatorSection,
  FinalCTASection,
  HomeFooter,
  SavingsLayersSection,
  TrustSection,
} from "@/components/home/HomeStaticSections";
import WorkedExample from "@/components/home/WorkedExample";
import { siteUrl } from "@/lib/env";
import { getStores } from "@/lib/repos";
import { getTopDeals } from "@/lib/repos/topDeals";
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
  // Both reads fall back gracefully (stores → static; top deals → []), so the
  // homepage always renders even without Supabase configured.
  const [stores, topDeals] = await Promise.all([getStores(), getTopDeals()]);
  const featured = pickFeaturedStack(stores);
  const site = siteUrl();

  return (
    <>
      <JsonLd data={buildWebSiteJsonLd(site)} />
      <JsonLd data={buildOrganizationJsonLd(site)} />
      <div className="min-h-screen bg-background">
        <HomeNav />
        <main>
          <HomeSearchSections
            stores={stores}
            featured={featured}
            savingsSlot={<SavingsLayersSection />}
          />

          {/* Today's top OzBargain signals (staged, review-gated, read-only) */}
          <TopDealsSection deals={topDeals} />

          <WorkedExample featured={featured} />
          <CalculatorSection stores={stores} />
          <TrustSection />
          <FinalCTASection />
        </main>
        <HomeFooter />
      </div>
    </>
  );
}
