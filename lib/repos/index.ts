/**
 * Repository barrel.
 *
 * Each getter reads from Supabase when configured and gracefully falls back to
 * the static data (lib/data.ts, lib/offers/manualOffers.ts) when Supabase env
 * vars are missing, the query fails, returns no rows, or DATA_SOURCE=static.
 *
 * These are server/data-layer functions — do not import into client components.
 * No UI is wired to them yet (that's a later step).
 */

export { getStores } from "./stores";
export {
  getCardOffers,
  getGiftCardOffers,
  getCashbackOffers,
  getPointsOffers,
  getOzBargainSignals,
} from "./offers";
export { getWeeklyDeals } from "./weeklyDeals";
