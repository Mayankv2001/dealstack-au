import type { GiftCardOffer } from "@/lib/offers/types";
import { addDaysToIsoDate, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { giftCardDateState } from "@/lib/giftcards/dateState";

/**
 * Shared selection + deterministic ordering for the PUBLIC gift-card display
 * surfaces (homepage carousel, /gift-cards grid, detail resolution). Pure and
 * unit-testable — no I/O; the repository injects already-published rows.
 *
 * How this differs from the strict `filterConfirmedCurrentOffers` boundary
 * (lib/giftcards/lifecycle.ts) that `getGiftCardOffers()` applies for the stack
 * ENGINE: a reviewed, published offer whose expiry is simply *unknown* (no
 * expiry_date and not explicitly marked ongoing) is a real, current offer — the
 * source merely omitted an end date. Those are KEPT here and ranked LAST behind
 * every dated active offer, and the card view-model labels them honestly
 * ("Date unknown" / "Ongoing"), never as a confirmed expiry.
 *
 * UPCOMING TIER (display policy): a reviewed offer whose start date falls
 * within the next UPCOMING_DISPLAY_WINDOW_DAYS is shown AFTER every active
 * offer, always carrying the explicit "Starts D Mon YYYY" label from the card
 * view-model and never any active-sounding urgency. It must never be
 * *presented* as active — the stack-engine boundary continues to exclude
 * future rows entirely. Far-future rows (outside the window) and expired rows
 * are never displayed. Nothing unreviewed is surfaced — the input is already
 * the RLS-published set.
 *
 * Deterministic order, in tiers:
 *   1. Active offers, ending soonest first (known expiry ascending);
 *      unknown-expiry active offers after all dated ones.
 *      Tie-break: most recently checked, then id ascending.
 *   2. Upcoming reviewed offers, starting soonest first;
 *      tie-break: earliest expiry, then most recently checked, then id.
 * The same input always sorts the same — no truncation happens here.
 */

/** How many days before its start date an upcoming offer becomes visible. */
export const UPCOMING_DISPLAY_WINDOW_DAYS = 7;

const UNKNOWN_EXPIRY_SENTINEL = "9999-12-31";

function timeMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Deterministic order WITHIN the active tier:
 *   1. Ending soonest first (known expiry ascending).
 *   2. Offers with unknown expiry after all known-expiry offers.
 *   3. Tie-break: most recently verified/checked first (newest first).
 *   4. Final stable tie-break: offer id ascending.
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

/** Deterministic order WITHIN the upcoming tier: starting soonest first. */
export function compareUpcomingGiftCardOffers(
  a: GiftCardOffer,
  b: GiftCardOffer,
): number {
  const aStart = a.startDate ?? UNKNOWN_EXPIRY_SENTINEL;
  const bStart = b.startDate ?? UNKNOWN_EXPIRY_SENTINEL;
  if (aStart !== bStart) return aStart < bStart ? -1 : 1;
  return compareCurrentGiftCardOffers(a, b);
}

/**
 * True for a reviewed future offer inside the display window — it may be
 * SHOWN (labelled "Starts …"), never presented as active.
 */
export function isUpcomingSoonGiftCardOffer(
  offer: GiftCardOffer,
  now: Date = new Date(),
): boolean {
  if (giftCardDateState(offer, now) !== "future" || !offer.startDate) {
    return false;
  }
  const lastVisibleStart = addDaysToIsoDate(
    todayAU(now),
    UPCOMING_DISPLAY_WINDOW_DAYS,
  );
  return offer.startDate <= lastVisibleStart;
}

/**
 * Keep only genuinely-current offers from an already-published set: drop rows
 * whose confirmed end date has passed, and rows whose start date is still in
 * the future. Unknown-expiry and ongoing rows are retained.
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

/**
 * Selection + deterministic tiered ordering for the display surfaces:
 * every active offer first (ending soonest), then upcoming-soon offers
 * (starting soonest). Never truncates — pagination is the caller's concern.
 */
export function orderCurrentReviewedGiftCardOffers(
  offers: readonly GiftCardOffer[],
  now: Date = new Date(),
): GiftCardOffer[] {
  const active = selectCurrentGiftCardOffers(offers, now)
    .slice()
    .sort(compareCurrentGiftCardOffers);
  const upcoming = offers
    .filter((offer) => isUpcomingSoonGiftCardOffer(offer, now))
    .sort(compareUpcomingGiftCardOffers);
  return [...active, ...upcoming];
}
