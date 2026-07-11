import type { Store } from "@/lib/data";
import type { StackRecommendation, WeeklyDeal } from "@/lib/offers/types";
import { getWeeklyDeals } from "@/lib/repos";
import { buildStackRecommendations, type StackData } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import { buildPublicDeals } from "./normalise";
import type { PublicDeal } from "./types";

/**
 * Server loader for the /deals page. One pass over the repository layer
 * (anon client → RLS enforces the publication boundary), the pure stack
 * engine, then normalisation into the PublicDeal pool. Each source is loaded
 * with allSettled so a partial outage degrades to a partial page plus a
 * notice instead of a 500.
 */

export interface DealsBundle {
  deals: PublicDeal[];
  stores: Store[];
  stackRecommendations: StackRecommendation[];
  /** True when one of the sources failed and the page is partial. */
  partial: boolean;
}

const EMPTY_STACK_DATA: StackData = {
  stores: [],
  giftCardOffers: [],
  cashbackOffers: [],
  pointsOffers: [],
  ozBargainSignals: [],
};

export async function loadDealsBundle(now: Date = new Date()): Promise<DealsBundle> {
  const [stackSettled, weeklySettled] = await Promise.allSettled([
    loadStackData(),
    getWeeklyDeals(),
  ]);

  const partial =
    stackSettled.status === "rejected" || weeklySettled.status === "rejected";
  const data =
    stackSettled.status === "fulfilled" ? stackSettled.value : EMPTY_STACK_DATA;
  const weekly: WeeklyDeal[] =
    weeklySettled.status === "fulfilled" ? weeklySettled.value : [];

  const stackRecommendations = buildStackRecommendations(undefined, undefined, data);
  const stackableMerchantIds = new Set(
    stackRecommendations.map((rec) => rec.merchantId)
  );

  const deals = buildPublicDeals(
    {
      stores: data.stores,
      signals: data.ozBargainSignals,
      giftCards: data.giftCardOffers,
      cashback: data.cashbackOffers,
      points: data.pointsOffers,
      weekly,
      stackableMerchantIds,
    },
    now
  );

  return { deals, stores: data.stores, stackRecommendations, partial };
}
