import type { Metadata } from "next";
import DealsClient from "@/components/DealsClient";
import { getWeeklyDeals } from "@/lib/repos";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";

/**
 * Weekly Deals route — server component. Loads data from the repository layer
 * (Supabase when configured, static fallback otherwise), computes the stack
 * recommendations, and passes everything to the interactive DealsClient. Owns
 * the route metadata; the client island owns filter state only.
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

  return (
    <DealsClient
      stackRecommendations={stackRecommendations}
      weeklyDeals={weeklyDeals}
      stores={data.stores}
      giftCardOffers={data.giftCardOffers}
      cashbackOffers={data.cashbackOffers}
      pointsOffers={data.pointsOffers}
      ozBargainSignals={data.ozBargainSignals}
    />
  );
}
