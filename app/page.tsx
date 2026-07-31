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
import { isExpiringSoonAU } from "@/lib/offers/expiry";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  getCardOffers,
  getCurrentReviewedGiftCardOffers,
  getCurrentReviewedPointsOffers,
  getTransferBonuses,
  getWeeklyDeals,
} from "@/lib/repos";
import { buildPublicDeals } from "@/lib/deals/normalise";
import { endingSoonDeals, latestReviewedDeals } from "@/lib/deals/highlights";
import {
  CategoryTiles,
  EndingSoonSection,
  HowWeReview,
  LatestReviewedSection,
} from "@/components/home/FrontPageSections";
import { countForProgramme } from "@/lib/rewards/offerCounts";
import { airlineProgrammes } from "@/lib/rewards/programmes";
import {
  PROGRAMME_TAB_PARAM,
  parseProgrammeTab,
} from "@/lib/rewards/programmeTabs";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import { isFeaturedStackEligible, partitionStacks } from "@/lib/stack/present";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structuredData";

export const metadata: Metadata = {
  title: "DealStack AU — Every offer, human-checked",
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

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = new Date();
  // Which programme tab to show. Anything unrecognised falls back to the
  // default rather than rendering an empty tab, so a stale link still works.
  const activeProgramme = parseProgrammeTab(
    (await searchParams)[PROGRAMME_TAB_PARAM]
  );
  const [
    data,
    giftCardCarouselOffers,
    pointsOffers,
    transferBonuses,
    cardOffers,
    weeklyDeals,
  ] = await Promise.all([
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
      getCardOffers(),
      getWeeklyDeals(),
    ]);
  const recommendations = buildStackRecommendations(undefined, 500, data, now);
  const { best } = partitionStacks(recommendations);
  const featured =
    best.find((recommendation) =>
      isFeaturedStackEligible(recommendation, now),
    ) ?? null;
  const heroStack = featured;
  // Homepage offer carousel: the week's current offers, ending soonest first
  // (unknown-expiry last). Gift cards come from the same published pool the
  // /gift-cards grid uses; the in-store points boosts come from the same
  // display read /rewards uses, because that is where a supermarket
  // gift-card promotion is actually recorded.
  const marquee = buildMarquee(giftCardCarouselOffers, now, {
    points: pointsOffers,
    storeNames: new Map(data.stores.map((store) => [store.id, store.name])),
  });
  // Review-freshness stamp for the hero: real figures from the same reviewed
  // pools the page already renders, never the mock's sample numbers.
  const stampPool = [
    ...data.giftCardOffers,
    ...data.cashbackOffers,
    ...pointsOffers,
    ...transferBonuses,
    ...cardOffers,
  ];
  const lastCheckedIso = stampPool.reduce(
    (max, offer) => (offer.lastCheckedAt > max ? offer.lastCheckedAt : max),
    "",
  );
  // The same normalised pool /deals queries, so the front-page highlight
  // sections can never disagree with the deals page about titles or dates.
  const publicDeals = buildPublicDeals(
    {
      stores: data.stores,
      giftCards: data.giftCardOffers,
      cashback: data.cashbackOffers,
      points: data.pointsOffers,
      weekly: weeklyDeals,
      stackableMerchantIds: new Set(recommendations.map((r) => r.merchantId)),
    },
    now,
  );
  const liveDeals = publicDeals.filter((d) => d.dateStatus !== "expired");
  const [qantas, velocity] = airlineProgrammes();
  const categoryTiles = [
    {
      name: "Qantas",
      count: countForProgramme(qantas, pointsOffers, data.giftCardOffers),
      desc: "Frequent Flyer bonuses, shopping boosts and transfer promos.",
      href: "/rewards/qantas-frequent-flyer",
    },
    {
      name: "Velocity",
      count: countForProgramme(velocity, pointsOffers, data.giftCardOffers),
      desc: "Velocity offers plus Flybuys transfers at the base rate.",
      href: "/rewards/velocity-frequent-flyer",
    },
    {
      name: "Deals",
      count: liveDeals.length,
      desc: "Cashback, gift card discounts and stackable store offers.",
      href: "/deals",
    },
    {
      name: "Credit cards",
      count: cardOffers.length,
      desc: "Sign-up bonuses with fees and spend requirements up front.",
      href: "/cards",
    },
  ];
  const checkStamp = {
    lastChecked: formatDateAU(lastCheckedIso.slice(0, 10)) ?? "recently",
    liveCount: stampPool.length,
    endingSoon: stampPool.filter((offer) =>
      isExpiringSoonAU(offer.expiryDate, now),
    ).length,
  };
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
            checkStamp={checkStamp}
            tiles={<CategoryTiles tiles={categoryTiles} />}
            marquee={
              <OfferMarquee
                key="offer-marquee"
                slides={marquee.slides}
                liveCount={marquee.liveCount}
              />
            }
          />

          <EndingSoonSection deals={endingSoonDeals(publicDeals, now)} />
          <LatestReviewedSection deals={latestReviewedDeals(publicDeals)} />

          {/* The full tabbed offer lists stand in for the mock's ink
              programme cards — same destinations, with the offers inline. */}
          <HomeProgrammeOffers
            pointsOffers={pointsOffers}
            giftCardOffers={data.giftCardOffers}
            transferBonuses={transferBonuses}
            active={activeProgramme}
          />
          <HowWeReview />

          <SavingsLayersSection />
          <CalculatorSection recommendations={recommendations} />
        </main>
        <HomeFooter />
      </div>
    </>
  );
}
