import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import HomeProgrammeOffers from "@/components/home/HomeProgrammeOffers";
import HomeSearchSections from "@/components/home/HomeSearchSections";
import OfferMarquee from "@/components/home/OfferMarquee";
import {
  CalculatorSection,
  HomeFooter,
  SavingsLayersSection,
} from "@/components/home/HomeStaticSections";
import { siteUrl } from "@/lib/env";
import { buildMarquee } from "@/lib/giftcards/marquee";
import {
  getCurrentReviewedGiftCardOffers,
  getCurrentReviewedPointsOffers,
  getTransferBonuses,
} from "@/lib/repos";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import { isFeaturedStackEligible, partitionStacks } from "@/lib/stack/present";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structuredData";

export const metadata: Metadata = {
  title: "DealStack AU — Plan the cheapest way to buy",
  description:
    "Enter an Australian store and expected spend to compare compatible codes, gift cards, cashback and points in the safest order.",
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
  const [data, giftCardCarouselOffers, pointsOffers, transferBonuses] =
    await Promise.all([
      loadStackData(),
      // The carousel keeps reviewed offers whose expiry is merely unknown
      // (ranked last) plus labelled upcoming-soon offers, so it shows the full
      // displayable set — every offer becomes a slide; the carousel pages,
      // never truncates. See lib/giftcards/currentOffers.ts.
      getCurrentReviewedGiftCardOffers({ orderBy: "ending-soonest" }),
      // NOT data.pointsOffers: that is the stack-engine read, unordered and
      // carrying not-yet-started rows without the display tiering. A block
      // that renders offers rather than counting them needs the display read,
      // the same one /rewards uses, or the two pages disagree on order and on
      // how a future offer is presented.
      getCurrentReviewedPointsOffers(),
      getTransferBonuses(),
    ]);
  const recommendations = buildStackRecommendations(undefined, 500, data, now);
  const { best } = partitionStacks(recommendations);
  const featured =
    best.find((recommendation) =>
      isFeaturedStackEligible(recommendation, now),
    ) ?? null;
  const heroStack = featured;
  // Homepage offer carousel: the week's current gift-card offers, ending
  // soonest first (unknown-expiry last), derived from the same published
  // offers the /gift-cards grid uses.
  const marquee = buildMarquee(giftCardCarouselOffers, now);
  const site = siteUrl();

  return (
    <>
      <JsonLd data={buildWebSiteJsonLd(site)} />
      <JsonLd data={buildOrganizationJsonLd(site)} />
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main>
          {/* Leads the page: every current Qantas and Velocity offer, ahead of
              the purchase planner. */}
          <HomeProgrammeOffers
            pointsOffers={pointsOffers}
            giftCardOffers={data.giftCardOffers}
            transferBonuses={transferBonuses}
          />

          <HomeSearchSections
            stores={data.stores}
            recommendations={recommendations}
            heroStack={heroStack}
            nowIso={now.toISOString()}
            marquee={
              <OfferMarquee
                key="offer-marquee"
                slides={marquee.slides}
                liveCount={marquee.liveCount}
              />
            }
          />

          <SavingsLayersSection />
          <CalculatorSection recommendations={recommendations} />
        </main>
        <HomeFooter />
      </div>
    </>
  );
}
