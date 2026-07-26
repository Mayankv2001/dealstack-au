import type { PointsOffer } from "@/lib/offers/types";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * Start/end date policy for points offers. PURE — every function takes the
 * clock explicitly, so the AU-midnight boundary is testable rather than
 * incidental.
 *
 * A reviewed future offer is ALWAYS shown, however far out its start date is:
 * a promotion worth planning around is worth knowing about early, and hiding
 * it until the week before is the behaviour this deliberately drops. It is
 * ranked after every active offer and always carries an explicit "Starts …"
 * label, never active-sounding urgency.
 *
 * This is where points DIVERGE from gift cards: lib/giftcards/currentOffers.ts
 * still hides anything starting beyond UPCOMING_DISPLAY_WINDOW_DAYS. The two
 * are separate editorial calls, not an oversight.
 *
 * Dates are compared as YYYY-MM-DD strings against todayAU(), never via Date
 * parsing — that is UTC-relative and lands a day out around AU midnight.
 */

export type PointsOfferDateState = "expired" | "future" | "active";

/**
 * Explicit classifier. A missing start date means "already running" (that is
 * what the column's null means), but a missing EXPIRY proves nothing about
 * whether the promotion still stands — it is still "active" here, and the
 * labels below say only what the row actually carries.
 */
export function pointsOfferDateState(
  offer: Pick<PointsOffer, "startsOn" | "expiryDate">,
  now: Date = new Date()
): PointsOfferDateState {
  const today = todayAU(now);
  if (isPastExpiry(offer.expiryDate, today)) return "expired";
  if (offer.startsOn && offer.startsOn > today) return "future";
  return "active";
}

/**
 * True for a reviewed offer that has not started yet. No distance limit — it
 * is SHOWN (labelled "Starts …") however far out, but never presented as
 * active.
 */
export function isUpcomingPointsOffer(
  offer: Pick<PointsOffer, "startsOn" | "expiryDate">,
  now: Date = new Date()
): boolean {
  return pointsOfferDateState(offer, now) === "future";
}

/**
 * Offers earning RIGHT NOW: expired and not-yet-started rows both dropped.
 * This is the set the stack engine may treat as an earn rate.
 */
export function selectActivePointsOffers<
  T extends Pick<PointsOffer, "startsOn" | "expiryDate">,
>(offers: readonly T[], now: Date = new Date()): T[] {
  return offers.filter((offer) => pointsOfferDateState(offer, now) === "active");
}

const UNKNOWN_DATE_SENTINEL = "9999-12-31";

function timeMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Order WITHIN the active tier: ending soonest first, offers with no end date
 * after all dated ones, then most recently checked, then id.
 */
export function compareCurrentPointsOffers(
  a: PointsOffer,
  b: PointsOffer
): number {
  const aEnd = a.expiryDate ?? UNKNOWN_DATE_SENTINEL;
  const bEnd = b.expiryDate ?? UNKNOWN_DATE_SENTINEL;
  if (aEnd !== bEnd) return aEnd < bEnd ? -1 : 1;

  const aChecked = timeMs(a.lastCheckedAt);
  const bChecked = timeMs(b.lastCheckedAt);
  if (aChecked !== bChecked) return bChecked - aChecked;

  return a.id.localeCompare(b.id);
}

/** Order WITHIN the upcoming tier: starting soonest first. */
export function compareUpcomingPointsOffers(
  a: PointsOffer,
  b: PointsOffer
): number {
  const aStart = a.startsOn ?? UNKNOWN_DATE_SENTINEL;
  const bStart = b.startsOn ?? UNKNOWN_DATE_SENTINEL;
  if (aStart !== bStart) return aStart < bStart ? -1 : 1;
  return compareCurrentPointsOffers(a, b);
}

/**
 * The public DISPLAY list: every active offer (ending soonest), then every
 * future offer (starting soonest), however distant. Expired rows are the only
 * thing dropped. Never truncates.
 */
export function orderCurrentReviewedPointsOffers(
  offers: readonly PointsOffer[],
  now: Date = new Date()
): PointsOffer[] {
  const active = selectActivePointsOffers(offers, now)
    .slice()
    .sort(compareCurrentPointsOffers);
  const upcoming = offers
    .filter((offer) => isUpcomingPointsOffer(offer, now))
    .sort(compareUpcomingPointsOffers);
  return [...active, ...upcoming];
}

/**
 * What the card may say about this offer's dates, in order.
 *
 * Only ever states what the row carries. A future offer leads with the
 * mandated "Starts …" so it can never read as running, and a row with no end
 * date says the end date is not listed rather than claiming it is ongoing —
 * `points_offers` has no reviewer-set ongoing flag, so "ongoing" would be an
 * assertion we cannot support (the same reason giftCardDateState refuses it).
 */
export function pointsOfferDateLabels(
  offer: Pick<PointsOffer, "startsOn" | "expiryDate">,
  now: Date = new Date()
): string[] {
  const state = pointsOfferDateState(offer, now);
  const starts = formatDateAU(offer.startsOn);
  const ends = formatDateAU(offer.expiryDate);

  if (state === "future" && starts) {
    return ends ? [`Starts ${starts}`, `Ends ${ends}`] : [`Starts ${starts}`];
  }
  if (starts && ends) return [`${starts} to ${ends}`];
  if (ends) return [`Ends ${ends}`];
  return ["No end date listed"];
}
