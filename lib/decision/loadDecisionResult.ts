import { buildPublicDeals } from "@/lib/deals/normalise";
import type { DealsBundle } from "@/lib/deals/load";
import {
  getAllGiftCardAcceptance,
  getAllGiftCardProducts,
  getWeeklyDeals,
} from "@/lib/repos";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";
import {
  buildSmartStackResults,
  buildSmartStackView,
} from "@/lib/stack/smartStack";
import { buildDecisionResult } from "./buildDecisionResult";
import type { DecisionResult } from "./types";

export async function loadDecisionResult(
  query: string,
  spend: number = 500,
  now: Date = new Date(),
): Promise<DecisionResult> {
  const [stackSettled, weeklySettled, productsSettled, acceptanceSettled] =
    await Promise.allSettled([
      loadStackData(),
      getWeeklyDeals(),
      getAllGiftCardProducts(),
      getAllGiftCardAcceptance(),
    ]);
  const partial = [
    stackSettled,
    weeklySettled,
    productsSettled,
    acceptanceSettled,
  ].some((result) => result.status === "rejected");
  const stackData =
    stackSettled.status === "fulfilled"
      ? stackSettled.value
      : {
          stores: [],
          giftCardOffers: [],
          cashbackOffers: [],
          pointsOffers: [],
          ozBargainSignals: [],
          giftCardProducts: [],
          giftCardAcceptance: [],
        };
  const products =
    productsSettled.status === "fulfilled"
      ? productsSettled.value
      : (stackData.giftCardProducts ?? []);
  const acceptance =
    acceptanceSettled.status === "fulfilled"
      ? acceptanceSettled.value
      : (stackData.giftCardAcceptance ?? []);
  const stackRecommendations = buildStackRecommendations(
    undefined,
    spend,
    stackData,
    now,
  );
  const stackableMerchantIds = new Set(
    stackRecommendations.map((recommendation) => recommendation.merchantId),
  );
  const deals = buildPublicDeals(
    {
      stores: stackData.stores,
      signals: stackData.ozBargainSignals,
      giftCards: stackData.giftCardOffers,
      cashback: stackData.cashbackOffers,
      points: stackData.pointsOffers,
      weekly: weeklySettled.status === "fulfilled" ? weeklySettled.value : [],
      stackableMerchantIds,
    },
    now,
  );
  const bundle: DealsBundle = {
    deals,
    stores: stackData.stores,
    stackRecommendations,
    partial,
  };
  const productMatches = query.trim()
    ? buildSmartStackResults(query, stackData, now)
    : [];
  const productComparisons = buildSmartStackView(productMatches).flatMap(
    (item) => (item.kind === "comparison" ? [item] : []),
  );
  return buildDecisionResult(query, spend, {
    bundle,
    products,
    acceptance,
    giftCardOffers: stackData.giftCardOffers,
    productComparisons,
    productMatches,
  });
}
