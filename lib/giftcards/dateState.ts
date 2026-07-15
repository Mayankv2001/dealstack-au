import { todayAU } from "@/lib/offers/expiry";

export type GiftCardDateState =
  | "future"
  | "active"
  | "expired"
  | "ongoing"
  | "missing";

/** Explicit date-state classifier; null expiry never implies ongoing. */
export function giftCardDateState(
  offer: {
    startDate?: string | null;
    expiryDate?: string | null;
    isOngoing?: boolean;
  },
  now: Date = new Date()
): GiftCardDateState {
  const today = todayAU(now);
  if (offer.expiryDate && offer.expiryDate < today) return "expired";
  if (offer.startDate && offer.startDate > today) return "future";
  if (offer.isOngoing === true) return "ongoing";
  // A start date alone does not prove that a short-term promotion is still
  // current. Missing expiry stays unknown unless a reviewer explicitly marked
  // the record ongoing.
  if (offer.expiryDate) return "active";
  return "missing";
}
