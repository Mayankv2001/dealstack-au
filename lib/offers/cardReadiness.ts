import { findPlaceholderMarkers } from "@/lib/content/placeholderCopy";
import { isPastExpiry, todayAU } from "@/lib/offers/expiry";
import type { CardOfferType } from "@/lib/offers/types";
import type { Confidence } from "@/lib/sources/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/** The card fields needed to decide whether an offer is safe to publish. */
export interface CardOfferReadinessInput {
  provider: string;
  cardName: string;
  offerType: CardOfferType;
  bonusPoints: number | null;
  cashbackAmount: number | null;
  statementCreditAmount: number | null;
  annualFee: number | null;
  eligibilityNotes: string;
  offerSummary: string;
  sourceUrl: string;
  confidence: Confidence;
  expiryDate: string | null;
  reviewByDate: string | null;
}

export type CardOfferReadiness =
  | { ready: true }
  | { ready: false; reasons: string[] };

function isPositiveAmount(value: number | null): boolean {
  return value != null && Number.isFinite(value) && value > 0;
}

function headlineFailure(offer: CardOfferReadinessInput): string | null {
  switch (offer.offerType) {
    case "sign_up_bonus":
    case "points_bonus":
      return isPositiveAmount(offer.bonusPoints)
        ? null
        : "bonus points must be greater than zero for sign-up and points bonus offers";
    case "cashback":
      return isPositiveAmount(offer.cashbackAmount)
        ? null
        : "cashback amount must be greater than zero for cashback offers";
    case "statement_credit":
      return isPositiveAmount(offer.statementCreditAmount)
        ? null
        : "statement credit must be greater than zero for statement credit offers";
    case "annual_fee_discount":
      // A zero annual fee is a meaningful headline for a full fee waiver.
      return offer.annualFee != null && Number.isFinite(offer.annualFee) && offer.annualFee >= 0
        ? null
        : "annual fee is required for annual fee discount offers";
    default:
      return "offer type is not supported";
  }
}

/** Returns every reason an offer is not ready, in stable display order. */
export function cardOfferReadiness(
  offer: CardOfferReadinessInput,
  today: string = todayAU()
): CardOfferReadiness {
  const reasons: string[] = [];

  if (!offer.provider.trim()) {
    reasons.push("provider/bank is required");
  }
  if (!offer.cardName.trim()) {
    reasons.push("card name is required");
  }

  if (offer.confidence !== "confirmed") {
    reasons.push("confidence must be Confirmed");
  }

  if (offer.expiryDate && isPastExpiry(offer.expiryDate, today)) {
    reasons.push("expiry date has passed");
  }

  if (!offer.reviewByDate) {
    reasons.push("review-by date is required");
  } else if (isPastExpiry(offer.reviewByDate, today)) {
    reasons.push("review-by date has passed; verify the offer again");
  }

  if (!offer.sourceUrl.trim()) {
    reasons.push("an issuer HTTPS source URL is required");
  } else if (!safeHttpsUrl(offer.sourceUrl)) {
    reasons.push("source URL must be a valid HTTPS URL");
  }

  const headlineReason = headlineFailure(offer);
  if (headlineReason) reasons.push(headlineReason);

  const markers = findPlaceholderMarkers([
    offer.provider,
    offer.cardName,
    offer.offerSummary,
    offer.eligibilityNotes,
  ]);
  if (markers.length > 0) {
    reasons.push(`remove placeholder wording (${markers.join(", ")})`);
  }

  return reasons.length === 0 ? { ready: true } : { ready: false, reasons };
}

export function isPublicReadyCardOffer(
  offer: CardOfferReadinessInput,
  today: string = todayAU()
): boolean {
  return cardOfferReadiness(offer, today).ready;
}

/** One concise, actionable message shared by every admin publish path. */
export function cardOfferPublishErrorMessage(
  offer: CardOfferReadinessInput,
  today: string = todayAU()
): string | null {
  const readiness = cardOfferReadiness(offer, today);
  return readiness.ready
    ? null
    : `Cannot publish: ${readiness.reasons.join("; ")}.`;
}
