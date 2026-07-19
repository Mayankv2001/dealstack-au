import type { GiftCardOffer } from "@/lib/offers/types";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { giftCardDateState } from "@/lib/giftcards/dateState";

/**
 * Shared selection + deterministic ordering for the PUBLIC gift-card display
 * surfaces (homepage carousel, /gift-cards grid). Pure and unit-testable — no
 * I/O; the repository injects already-published rows.
 *
 * How this differs from the strict `filterConfirmedCurrentOffers` boundary
 * (lib/giftcards/lifecycle.ts) that `getGiftCardOffers()` applies for the stack
 * ENGINE: a reviewed, published offer whose expiry is simply *unknown* (no
 * expiry_date and not explicitly marked ongoing) is a real, current offer — the
 * source merely omitted an end date. Those are KEPT here and ranked LAST behind
 * every dated offer, and the card view-model labels them honestly ("Date
 * unknown" / "Ongoing"), never as a confirmed expiry. Only two states are ever
 * removed: an offer whose confirmed end date has passed, and one whose start
 * date is still in the future. Nothing unreviewed is surfaced — the input is
 * already the RLS-published set.
 */

const UNKNOWN_EXPIRY_SENTINEL = "9999-12-31";

function timeMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Deterministic order for current offers:
 *   1. Ending soonest first (known expiry ascending).
 *   2. Offers with unknown expiry after all known-expiry offers.
 *   3. Tie-break: most recently verified/checked first (newest first).
 *   4. Final stable tie-break: offer id ascending.
 * Stable and render-order-independent — the same input always sorts the same.
 */
export function compareCurrentGiftCardOffers(
  a: GiftCardOffer,
  b: GiftCardOffer,
): number {
  const aEnd = a.expiryDate ?? UNKNOWN_EXPIRY_SENTINEL;
  const bEnd = b.expiryDate ?? UNKNOWN_EXPIRY_SENTINEL;
  if (aEnd !== bEnd) return aEnd < bEnd ? -1 : 1;

  const aChecked = timeMs(a.lastCheckedAt);
  const bChecked = timeMs(b.lastCheckedAt);
  if (aChecked !== bChecked) return bChecked - aChecked;

  return a.id.localeCompare(b.id);
}

/**
 * Keep only genuinely-current offers from an already-published set: drop rows
 * whose confirmed end date has passed, and rows whose start date is still in the
 * future. Unknown-expiry and ongoing rows are retained.
 */
export function selectCurrentGiftCardOffers(
  offers: readonly GiftCardOffer[],
  now: Date = new Date(),
): GiftCardOffer[] {
  const today = todayAU(now);
  return offers.filter((offer) => {
    if (isPastExpiry(offer.expiryDate, today)) return false;
    if (giftCardDateState(offer, now) === "future") return false;
    return true;
  });
}

/** Selection + deterministic ordering in one pass (see the two helpers above). */
export function orderCurrentReviewedGiftCardOffers(
  offers: readonly GiftCardOffer[],
  now: Date = new Date(),
): GiftCardOffer[] {
  return selectCurrentGiftCardOffers(offers, now)
    .slice()
    .sort(compareCurrentGiftCardOffers);
}
