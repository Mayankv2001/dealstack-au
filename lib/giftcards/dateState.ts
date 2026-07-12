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
  if (offer.expiryDate || offer.startDate) return "active";
  if (offer.isOngoing === true) return "ongoing";
  return "missing";
}
