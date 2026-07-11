/**
 * Repository barrel.
 *
 * Each getter reads from Supabase when configured. Static data is available
 * only when Supabase env vars are missing or DATA_SOURCE=static; configured
 * empty/error reads stay empty so demo values cannot masquerade as live data.
 *
 * These are server/data-layer functions — do not import into client components.
 * Public server components pass their serializable results into client islands.
 */

export { getStores } from "./stores";
export {
  getCardOffers,
  getPublicCardOffer,
  getCardOfferHistory,
  getGiftCardOffers,
  getCashbackOffers,
  getPointsOffers,
  getOzBargainSignals,
} from "./offers";
export { getWeeklyDeals } from "./weeklyDeals";
