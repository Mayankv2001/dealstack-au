import {
  getCashbackOffers,
  getGiftCardOffers,
  getOzBargainSignals,
  getPointsOffers,
  getStores,
} from "@/lib/repos";
import type { StackRecommendation } from "@/lib/offers/types";
import {
  buildStackRecommendations,
  type StackData,
} from "@/lib/stack/buildStack";

/**
 * Server-side stack loaders.
 *
 * Gather the engine's data from the repository layer (Supabase when configured,
 * static fallback otherwise), then run the pure stack engine. Server/data-layer
 * only — not yet wired into any page.
 */

/** Load the full StackData bundle from the repos (DB-or-static). */
export async function loadStackData(): Promise<StackData> {
  const [stores, giftCardOffers, cashbackOffers, pointsOffers, ozBargainSignals] =
    await Promise.all([
      getStores(),
      getGiftCardOffers(),
      getCashbackOffers(),
      getPointsOffers(),
      getOzBargainSignals(),
    ]);
  return { stores, giftCardOffers, cashbackOffers, pointsOffers, ozBargainSignals };
}

/** Load repo data and return stack recommendations (same engine, injected data). */
export async function loadStackRecommendations(
  input?: string,
  spend?: number
): Promise<StackRecommendation[]> {
  const data = await loadStackData();
  return buildStackRecommendations(input, spend, data);
}
