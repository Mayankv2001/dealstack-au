import type { Metadata } from "next";
import DealsClient from "@/components/DealsClient";
import { getWeeklyDeals } from "@/lib/repos";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import {
  isActiveDateRange,
  melbourneDateKey,
  mondayOfWeek,
} from "@/lib/offers/availability";

/**
 * Weekly Deals route — server component. Loads data from the repository layer
 * (Supabase when configured, static fallback otherwise), computes the stack
 * recommendations, and passes everything to the interactive DealsClient. Owns
 * the route metadata; the client island owns filter state only.
 */

export const metadata: Metadata = {
  title: "Weekly Deals",
  description:
    "Weekly deal stacks, gift card offers, points boosts, cashback boosts and deal signals for Australian shoppers.",
};

// ISR: serve cached HTML and refresh from the DB periodically. On-demand
// revalidation (revalidateTag/revalidatePath) arrives with the admin panel.
export const revalidate = 300;

export default async function DealsPage() {
  const now = new Date();
  const asOfDate = melbourneDateKey(now);
  const weekOf = mondayOfWeek(asOfDate);
  // One data load (stores + offers + signals), then the pure engine + weekly deals.
  const [loadedData, loadedWeeklyDeals] = await Promise.all([
    loadStackData(),
    getWeeklyDeals(),
  ]);
  // Public deal lists show only currently usable rows. Admin pages retain the
  // complete history, including expired and future offers, for governance.
  const data = {
    ...loadedData,
    giftCardOffers: loadedData.giftCardOffers.filter(
      (offer) =>
        offer.confidence !== "expired-unknown" &&
        isActiveDateRange(offer.startDate, offer.expiryDate, asOfDate)
    ),
    cashbackOffers: loadedData.cashbackOffers.filter(
      (offer) =>
        offer.confidence !== "expired-unknown" &&
        isActiveDateRange(null, offer.expiryDate, asOfDate)
    ),
    pointsOffers: loadedData.pointsOffers.filter(
      (offer) =>
        offer.confidence !== "expired-unknown" &&
        isActiveDateRange(null, offer.expiryDate, asOfDate)
    ),
    ozBargainSignals: loadedData.ozBargainSignals.filter(
      (offer) =>
        offer.confidence !== "expired-unknown" &&
        offer.status !== "expired" &&
        isActiveDateRange(null, offer.expiryDate, asOfDate)
    ),
  };
  const weeklyDeals = loadedWeeklyDeals.filter(
    (deal) =>
      deal.confidence !== "expired-unknown" &&
      isActiveDateRange(null, deal.expiryDate, asOfDate)
  );
  const stackRecommendations = buildStackRecommendations(
    undefined,
    undefined,
    data,
    { now }
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
      asOfDate={asOfDate}
      weekOf={weekOf}
    />
  );
}
