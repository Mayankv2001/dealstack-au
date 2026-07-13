import {
  getCashbackOffers,
  getGiftCardOffers,
  getGiftCardAcceptance,
  getGiftCardProducts,
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
 * Gather the engine's data from the repository layer, then run the pure stack
 * engine. Configured Supabase is authoritative; demo arrays are used only in
 * explicit static/unconfigured mode. Server/data-layer only.
 */

/** Load the full StackData bundle using the repositories' DB-or-demo policy. */
export async function loadStackData(): Promise<StackData> {
  const [stores, giftCardOffers, cashbackOffers, pointsOffers, ozBargainSignals] =
    await Promise.all([
      getStores(),
      getGiftCardOffers(),
      getCashbackOffers(),
      getPointsOffers(),
      getOzBargainSignals(),
    ]);
  const productIds = [
    ...new Set(
      giftCardOffers.flatMap((offer) =>
        [offer.productId, ...(offer.includedProductIds ?? [])].filter(
          (id): id is string => Boolean(id)
        )
      )
    ),
  ];
  const [giftCardProducts, giftCardAcceptance] = await Promise.all([
    getGiftCardProducts(productIds),
    getGiftCardAcceptance(productIds),
  ]);
  return {
    stores,
    giftCardOffers,
    cashbackOffers,
    pointsOffers,
    ozBargainSignals,
    giftCardProducts,
    giftCardAcceptance,
  };
}

/** Load repo data and return stack recommendations (same engine, injected data). */
export async function loadStackRecommendations(
  input?: string,
  spend?: number
): Promise<StackRecommendation[]> {
  const data = await loadStackData();
  return buildStackRecommendations(input, spend, data);
}
