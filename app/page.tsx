import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import SiteHeader from "@/components/SiteHeader";
import HomeSearchSections from "@/components/home/HomeSearchSections";
import OfferMarquee from "@/components/home/OfferMarquee";
import ProgrammeGroups from "@/components/rewards/ProgrammeGroups";
import {
  CalculatorSection,
  HomeFooter,
  SavingsLayersSection,
} from "@/components/home/HomeStaticSections";
import { siteUrl } from "@/lib/env";
import { buildMarquee } from "@/lib/giftcards/marquee";
import {
  getCurrentReviewedGiftCardOffers,
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
  const [data, giftCardCarouselOffers, transferBonuses] = await Promise.all([
    loadStackData(),
    // The carousel keeps reviewed offers whose expiry is merely unknown (ranked
    // last) plus labelled upcoming-soon offers, so it shows the full displayable
    // set — every offer becomes a slide; the carousel pages, never truncates.
    // See getCurrentReviewedGiftCardOffers / lib/giftcards/currentOffers.ts.
    getCurrentReviewedGiftCardOffers({ orderBy: "ending-soonest" }),
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

          {/* Points grouped by the airline programme they redeem through —
              supermarket points nested under where they transfer. Reuses the
              pools already loaded for the stack engine, so no extra queries. */}
          <section
            className="page-container py-10 sm:py-12"
            aria-labelledby="rewards-groups-heading"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Points and rewards</p>
                <h2
                  id="rewards-groups-heading"
                  className="section-title mt-2"
                >
                  Where the points land
                </h2>
              </div>
              <Link
                href="/rewards"
                className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-400"
              >
                All programmes <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Supermarket points sit under the airline programme they transfer
              into. Rewards stay separate from today’s cash price.
            </p>
            <div className="mt-5">
              <ProgrammeGroups
                pointsOffers={data.pointsOffers}
                giftCardOffers={data.giftCardOffers}
                transferBonuses={transferBonuses}
                variant="compact"
              />
            </div>
          </section>

          <SavingsLayersSection />
          <CalculatorSection recommendations={recommendations} />
        </main>
        <HomeFooter />
      </div>
    </>
  );
}
