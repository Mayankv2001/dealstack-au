import type { GiftCardOffer } from "@/lib/offers/types";
import { orderCurrentReviewedGiftCardOffers } from "@/lib/giftcards/currentOffers";
import {
  buildGiftCardOfferCardViewModel,
  type GiftCardCompatibilityTone,
} from "@/lib/giftcards/offerCardViewModel";
import { buildWorkedExample } from "@/lib/giftcards/value";

/**
 * Homepage offer carousel: the week's current gift-card offers as a paged
 * carousel (the component groups these cards 3/2/1-up by breakpoint), ordered
 * by ending soonest with unknown-expiry offers last. Pure derivation — no
 * fetching, no new publication surface. Every display string comes from the
 * shared card view model so the carousel can never disagree with the grid, and
 * the worked $100 example reuses the detail page's maths, which keeps cash and
 * reward estimates strictly separate. Selection + ordering are the shared,
 * deterministic rules in lib/giftcards/currentOffers.ts.
 */

/** The carousel shows at most this many cards; the grid link carries the rest. */
export const MARQUEE_SLIDE_CAP = 18;

/** Face value used for each slide's worked example. */
export const MARQUEE_EXAMPLE_FACE_VALUE = 100;

export interface MarqueeSlideExample {
  faceValue: number;
  /** Cash handed over for the face value (equals faceValue for points offers). */
  cashPaid: number;
  /** Immediate CASH saving — always 0 for points/bonus offers. */
  saving: number;
  points: number | null;
  /** Disclosed reward estimate in dollars — an estimate, never cash. */
  rewardValueDollars: number | null;
  pointValueCents: number | null;
  bonusValueDollars: number | null;
}

export interface MarqueeSlide {
  id: string;
  detailHref: string;
  mechanicLabel: string;
  valueBadge: string;
  brandPrimary: string;
  brandSecondary?: string;
  headline: string;
  sellerLabel: string;
  sourceLabel: string;
  dateLabel: string;
  urgencyLabel?: string;
  trustLabel: string;
  compatibilityLabel: string;
  compatibilityTone: GiftCardCompatibilityTone;
  /** True when the slide's value is points/bonus, never a cash discount. */
  isRewardOnly: boolean;
  /** Worked example at $100 face value; null when nothing is quantifiable. */
  example: MarqueeSlideExample | null;
  /** The single most important condition for this offer. */
  caveat: string;
}

export interface MarqueeModel {
  slides: MarqueeSlide[];
  /** Total live offers behind the "all offers" link (>= slides.length). */
  liveCount: number;
}

/** One prioritised condition per slide — the thing to check before relying on it. */
function slideCaveat(offer: GiftCardOffer, isRewardOnly: boolean, dateLabel: string): string {
  if (offer.membershipRequired || offer.channel === "membership-portal") {
    return "Requires an eligible membership to buy at this price.";
  }
  if (offer.activationRequired) {
    return "Activate the offer before purchasing.";
  }
  if (dateLabel.toLowerCase().includes("not recorded")) {
    return "Dates not recorded — verify at the source before relying on it.";
  }
  if (isRewardOnly) {
    return "Points are rewards, not cash — the price you pay is unchanged.";
  }
  return "Cashback may not track when paying with gift cards — check the portal's terms.";
}

export function buildMarquee(
  offers: GiftCardOffer[],
  now: Date = new Date(),
): MarqueeModel {
  const live = orderCurrentReviewedGiftCardOffers(offers, now);

  const slides = live.slice(0, MARQUEE_SLIDE_CAP).map((offer): MarqueeSlide => {
    const vm = buildGiftCardOfferCardViewModel(offer, now);
    const worked = buildWorkedExample(
      {
        promotionType: offer.promotionType ?? "discount",
        discountPercent: offer.discountPercent,
        bonusPercent: offer.bonusPercent ?? null,
        pointsMultiplier: offer.pointsMultiplier ?? null,
        fixedPoints: offer.fixedPoints ?? null,
        pointsProgram:
          offer.pointsProgram ?? offer.pointsOnPurchase?.program ?? null,
        pointsValueCents: offer.pointsValueCents ?? null,
        fixedDiscountDollars: offer.fixedDiscountDollars ?? null,
        promoCreditDollars: offer.promoCreditDollars ?? null,
        feeWaiverDollars: offer.feeWaiverDollars ?? null,
        thresholdDollars: offer.thresholdDollars ?? null,
        capDollars: offer.capDollars,
      },
      MARQUEE_EXAMPLE_FACE_VALUE,
    );
    const isRewardOnly =
      (offer.discountPercent ?? 0) <= 0 &&
      (offer.fixedDiscountDollars ?? 0) <= 0;
    return {
      id: offer.id,
      detailHref: vm.detailHref,
      mechanicLabel: vm.mechanicLabel,
      valueBadge: vm.valueBadge,
      brandPrimary: vm.brandPrimary,
      brandSecondary: vm.brandSecondary,
      headline: vm.headline,
      sellerLabel: vm.sellerLabel,
      sourceLabel: vm.sourceLabel,
      dateLabel: vm.dateLabel,
      urgencyLabel: vm.urgencyLabel,
      trustLabel: vm.trustLabel,
      compatibilityLabel: vm.compatibilityLabel,
      compatibilityTone: vm.compatibilityTone,
      isRewardOnly,
      example: worked
        ? {
            faceValue: worked.coveredFaceValue,
            cashPaid: worked.cashPaid,
            saving: worked.acquisitionSaving,
            points: worked.points,
            rewardValueDollars: worked.rewardValueDollars,
            pointValueCents: worked.pointValueCents,
            bonusValueDollars: worked.bonusValueDollars,
          }
        : null,
      caveat: slideCaveat(offer, isRewardOnly, vm.dateLabel),
    };
  });

  return { slides, liveCount: live.length };
}
