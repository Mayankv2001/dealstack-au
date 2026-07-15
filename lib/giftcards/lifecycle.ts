/**
 * Offer lifecycle engine (TASK-03) — pure, injectable clock, no I/O.
 *
 * Decides which admin-approved gift-card offers should ACTIVATE (their window
 * has opened), which should ARCHIVE (a confirmed end date has passed), which
 * are UPCOMING (start in the future — must never appear active), and which have
 * an UNKNOWN date (never treated as "confirmed current" for ranking).
 *
 * Trust rules (never violated here):
 *   - Only already-approved rows change visibility — no candidate is published.
 *   - Missing expiry ≠ expired and ≠ ongoing; is_ongoing = true never archives.
 *   - Nothing is deleted; archival seals a history occurrence elsewhere
 *     (offerOccurrenceSnapshot.ts / history.ts) — this module only decides.
 *
 * Date classification reuses giftCardDateState() (Australia/Sydney via todayAU),
 * so activation/archival happen on the Sydney calendar date, not UTC, and the
 * DST-safe derivation is not duplicated. Archival is date-level (conservative:
 * an offer with expiry_time later on its expiry_date is not archived until the
 * following Sydney day, so a still-valid offer is never removed early).
 */

import { giftCardDateState, type GiftCardDateState } from "@/lib/giftcards/dateState";

/** The minimal lifecycle view of an offer. `isActive` = currently on active surfaces. */
export interface LifecycleOffer {
  id: string;
  startDate?: string | null;
  expiryDate?: string | null;
  isOngoing?: boolean;
  /** True when the row is currently visible on active public surfaces. */
  isActive: boolean;
}

export interface LifecyclePlan {
  /** Approved rows whose window has opened but are not yet active. */
  toActivate: string[];
  /** Active rows whose confirmed end date has passed (never ongoing). */
  toArchive: string[];
  /** Rows whose start date is still in the future — must not be active. */
  upcoming: string[];
  /** Rows with no usable date and not ongoing — not "confirmed current". */
  unknownDate: string[];
}

function classify(offer: LifecycleOffer, now: Date): GiftCardDateState {
  return giftCardDateState(
    {
      startDate: offer.startDate ?? null,
      expiryDate: offer.expiryDate ?? null,
      isOngoing: offer.isOngoing,
    },
    now
  );
}

/**
 * Compute the lifecycle plan. Idempotent by construction: once an offer is
 * activated (`isActive = true`) it leaves `toActivate`; once archived
 * (`isActive = false`) it leaves `toArchive`. A second call with the applied
 * state returns empty activate/archive sets.
 */
export function planLifecycle(
  offers: readonly LifecycleOffer[],
  now: Date = new Date()
): LifecyclePlan {
  const plan: LifecyclePlan = {
    toActivate: [],
    toArchive: [],
    upcoming: [],
    unknownDate: [],
  };

  for (const offer of offers) {
    const state = classify(offer, now);
    switch (state) {
      case "active":
      case "ongoing":
        // Window is open (or evergreen). Approved-but-inactive → activate.
        if (!offer.isActive) plan.toActivate.push(offer.id);
        break;
      case "expired":
        // Confirmed end passed. Only archive if it is still on a surface.
        if (offer.isActive) plan.toArchive.push(offer.id);
        break;
      case "future":
        plan.upcoming.push(offer.id);
        break;
      case "missing":
        plan.unknownDate.push(offer.id);
        break;
    }
  }

  return plan;
}

/**
 * A row is "confirmed current" (eligible for ranking / best-verified) only when
 * it is active or ongoing with a real date — never when its date is unknown and
 * never when it is upcoming. Used by read paths to exclude unknown/upcoming rows
 * from confident surfaces without deleting or unpublishing anything.
 */
export function isConfirmedCurrent(offer: LifecycleOffer, now: Date = new Date()): boolean {
  const state = classify(offer, now);
  return state === "active" || state === "ongoing";
}

export interface PublicLifecycleWindow {
  id: string;
  startDate?: string | null;
  expiryDate?: string | null;
  isOngoing?: boolean;
}

/**
 * Central public-read boundary for gift-card offers. RLS proves review and
 * publication; this second boundary proves the Sydney date window is actually
 * open. Missing dates are not silently treated as ongoing.
 */
export function filterConfirmedCurrentOffers<T extends PublicLifecycleWindow>(
  offers: readonly T[],
  now: Date = new Date(),
): T[] {
  return offers.filter((offer) =>
    isConfirmedCurrent(
      {
        id: offer.id,
        startDate: offer.startDate ?? null,
        expiryDate: offer.expiryDate ?? null,
        isOngoing: offer.isOngoing === true,
        isActive: true,
      },
      now,
    ),
  );
}
