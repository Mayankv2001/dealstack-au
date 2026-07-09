import type { Confidence } from "@/lib/sources/types";
import type {
  CashbackOffer,
  GiftCardOffer,
  StackWarning,
} from "@/lib/offers/types";

/**
 * Pure compatibility + risk rules for the stack engine.
 *
 * Every function here is deterministic and side-effect free — no network, no
 * database, no clock unless passed in. They answer "can these layers coexist?"
 * and "what should we warn the user about?". The engine (buildStack.ts) calls
 * them; they are also unit-testable in isolation.
 */

/** Days within which an upcoming expiry is flagged as "expiry-soon". */
export const EXPIRY_SOON_DAYS = 7;
/** Age beyond which an offer's last check is flagged as "stale-data". */
export const STALE_DATA_DAYS = 21;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Confidence ranked worst→best so we can pick the worst across components. */
const CONFIDENCE_RANK: Record<Confidence, number> = {
  "expired-unknown": 0,
  "needs-verification": 1,
  confirmed: 2,
};

/** Returns the least-confident of the supplied confidences (worst wins). */
export function worstConfidence(values: Confidence[]): Confidence {
  if (values.length === 0) return "needs-verification";
  return values.reduce((worst, c) =>
    CONFIDENCE_RANK[c] < CONFIDENCE_RANK[worst] ? c : worst
  );
}

/** A gift card can only be used where it is accepted. */
export function isGiftCardAcceptedAtMerchant(
  offer: GiftCardOffer,
  merchantId: string
): boolean {
  return offer.acceptedAtMerchantIds.includes(merchantId);
}

/**
 * Most AU cashback voids when the order is paid with gift cards. When both a
 * gift card and such a cashback offer are in play, they conflict.
 */
export function cashbackConflictsWithGiftCard(
  cashback: CashbackOffer,
  usingGiftCard: boolean
): boolean {
  return usingGiftCard && cashback.excludesGiftCardPayment;
}

// ─── Warning builders (return a StackWarning or null) ───────────────────────

/** Flags an expiry that lands within EXPIRY_SOON_DAYS of `now` (and not past). */
export function expirySoonWarning(
  expiryDate: string | null,
  now: Date,
  label: string
): StackWarning | null {
  if (!expiryDate) return null;
  const end = new Date(`${expiryDate}T23:59:59+10:00`).getTime();
  const diff = end - now.getTime();
  if (diff < 0) return null; // already expired — handled by needs-verification path
  if (diff > EXPIRY_SOON_DAYS * MS_PER_DAY) return null;
  return {
    level: "caution",
    code: "expiry-soon",
    message: `${label} expires on ${expiryDate} — verify it is still live before relying on it.`,
  };
}

/** Flags an offer last checked more than STALE_DATA_DAYS ago. */
export function staleDataWarning(
  lastCheckedAt: string | null,
  now: Date,
  label: string
): StackWarning | null {
  if (!lastCheckedAt) return null;
  const checked = new Date(lastCheckedAt).getTime();
  if (Number.isNaN(checked)) return null;
  if (now.getTime() - checked <= STALE_DATA_DAYS * MS_PER_DAY) return null;
  return {
    level: "info",
    code: "stale-data",
    message: `${label} was last checked on ${lastCheckedAt.slice(0, 10)} — data may be out of date.`,
  };
}

/** Flags any layer whose confidence is not "confirmed". */
export function needsVerificationWarning(
  confidence: Confidence,
  label: string
): StackWarning | null {
  if (confidence === "confirmed") return null;
  const message =
    confidence === "expired-unknown"
      ? `${label} appears expired — confirm at the source before using it.`
      : `${label} is unverified — confirm the terms at the source before using it.`;
  return { level: "caution", code: "needs-verification", message };
}

/** Flags the cashback/gift-card payment conflict. */
export function giftCardCashbackConflictWarning(
  cashback: CashbackOffer,
  usingGiftCard: boolean
): StackWarning | null {
  if (!cashbackConflictsWithGiftCard(cashback, usingGiftCard)) return null;
  return {
    level: "risk",
    code: "gift-card-excluded-from-cashback",
    message: `${cashback.provider} cashback excludes gift card payment — you cannot claim both on the same order.`,
  };
}

/**
 * Gift-card (spend) cap check: `capDollars` caps the ELIGIBLE SPEND the
 * discount applies to. Fires when the checkout price exceeds that cap.
 */
export function capReachedWarning(
  capDollars: number | null,
  appliedDollars: number,
  label: string
): StackWarning | null {
  if (capDollars === null) return null;
  if (appliedDollars <= capDollars) return null;
  return {
    level: "caution",
    code: "cap-reached",
    message: `${label} only applies to the first $${capDollars} of spend — savings above that do not apply.`,
  };
}

/** Cashback cap: fires when the UNCAPPED saving exceeds the dollar cap. */
export function cashbackCapReachedWarning(
  capDollars: number | null,
  rawSavingDollars: number,
  label: string
): StackWarning | null {
  if (capDollars === null) return null;
  if (rawSavingDollars <= capDollars) return null;
  return {
    level: "caution",
    code: "cap-reached",
    message: `${label} is capped at $${capDollars} — cashback above the cap does not accrue.`,
  };
}
