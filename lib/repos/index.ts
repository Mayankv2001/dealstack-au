/**
 * Repository barrel.
 *
 * Each getter reads from Supabase when configured. Static samples are used only
 * for explicit DATA_SOURCE=static demo mode or an unconfigured local
 * development environment. Production errors and legitimate empty reads stay
 * empty so stale samples cannot reappear as current deals.
 *
 * These are server/data-layer functions — do not import into client components.
 * Public pages consume these repositories directly.
 */

export { getStores } from "./stores";
export {
  getGiftCardOffers,
  getCashbackOffers,
  getPointsOffers,
  getOzBargainSignals,
} from "./offers";
export { getWeeklyDeals } from "./weeklyDeals";
