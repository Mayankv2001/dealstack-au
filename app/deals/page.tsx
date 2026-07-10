import type { Metadata } from "next";
import DealsClient from "@/components/DealsClient";
import HotBuys from "@/components/HotBuys";
import {
  AlertsComingSoonSection,
  DealsHeader,
  DealsHero,
  HowWeCheckSection,
  TopStacksSection,
  VerifySection,
  WeeklyPicksSection,
} from "@/components/deals/DealsStaticSections";
import { deriveWeekLabel } from "@/components/deals/dealsData";
import { buildWeeklyPickCards } from "@/lib/offers/weeklyPicks";
import { getWeeklyDeals } from "@/lib/repos";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";

/**
 * Weekly Deals route — server component. Loads data from the repository layer
 * (Supabase when configured, static fallback otherwise), computes the stack
 * recommendations, and renders the static sections directly; only the
 * filterable middle of the page ships as the DealsClient island.
 */

export const metadata: Metadata = {
  title: "Weekly Deals | DealStack AU",
  description:
    "Weekly deal stacks, gift card offers, points boosts, cashback boosts and deal signals for Australian shoppers.",
};

// ISR: serve cached HTML and refresh from the DB periodically. On-demand
// revalidation (revalidateTag/revalidatePath) arrives with the admin panel.
export const revalidate = 300;

export default async function DealsPage() {
  // One data load (stores + offers + signals), then the pure engine + weekly deals.
  const [data, weeklyDeals] = await Promise.all([
    loadStackData(),
    getWeeklyDeals(),
  ]);
  const stackRecommendations = buildStackRecommendations(
    undefined,
    undefined,
    data
  );

  const storeNameById = new Map(data.stores.map((s) => [s.id, s.name]));
  const weeklyPicks = buildWeeklyPickCards(weeklyDeals, {
    giftCards: data.giftCardOffers,
    cashback: data.cashbackOffers,
    points: data.pointsOffers,
    signals: data.ozBargainSignals,
    storeNameById: (id) => (id ? (storeNameById.get(id) ?? null) : null),
  });

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <DealsHeader />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <DealsHero weekLabel={deriveWeekLabel(weeklyDeals)} />

        {/* Hot Buys — admin-approved Costco + OzBargain hot-buy signals only */}
        <HotBuys signals={data.ozBargainSignals} stores={data.stores} />

        <TopStacksSection
          topStacks={stackRecommendations.slice(0, 3)}
          stores={data.stores}
        />

        <WeeklyPicksSection picks={weeklyPicks} />

        {/* Programme guide, filter chips and the filtered sections. */}
        <DealsClient
          stackRecommendations={stackRecommendations}
          stores={data.stores}
          giftCardOffers={data.giftCardOffers}
          cashbackOffers={data.cashbackOffers}
          pointsOffers={data.pointsOffers}
          ozBargainSignals={data.ozBargainSignals}
        />

        <HowWeCheckSection />
        <AlertsComingSoonSection />
        <VerifySection />
      </main>
    </div>
  );
}
