import type { GiftCardOffer, PointsOffer } from "@/lib/offers/types";
import { orderCurrentReviewedGiftCardOffers } from "@/lib/giftcards/currentOffers";
import { giftCardDateState } from "@/lib/giftcards/dateState";
import {
  buildGiftCardOfferCardViewModel,
  type GiftCardCompatibilityTone,
} from "@/lib/giftcards/offerCardViewModel";
import { buildWorkedExample } from "@/lib/giftcards/value";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import {
  orderCurrentReviewedPointsOffers,
  pointsOfferDateLabels,
  pointsOfferDateState,
} from "@/lib/rewards/pointsOfferDates";
import { findRewardsProgramme } from "@/lib/rewards/programmes";
import { SOURCE_META } from "@/lib/sources/types";

/**
 * Homepage offer carousel: the week's current offers as a paged carousel (the
 * component groups these cards 3/2/1-up by breakpoint), ordered by ending
 * soonest with unknown-expiry offers last. Pure derivation — no fetching, no
 * new publication surface. Every display string comes from the shared card
 * view model so the carousel can never disagree with the grid, and the worked
 * $100 example reuses the detail page's maths, which keeps cash and reward
 * estimates strictly separate. Selection + ordering are the shared,
 * deterministic rules in lib/giftcards/currentOffers.ts.
 *
 * The carousel draws from TWO pools. Gift-card offers are the original source
 * and remain the default. Points offers were added because a supermarket
 * gift-card promotion is recorded in `points_offers` — that is where the Coles
 * and Woolworths weekly boosts live — and a carousel fed only by
 * `gift_card_offers` therefore rendered nothing at all in weeks when the GCDB
 * ingest had produced no reviewed candidate. Both pools apply their own
 * published/expiry rules before they reach here.
 */

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
  if (dateLabel.startsWith("Starts ")) {
    return "Upcoming offer — not active yet. Nothing can be claimed before the start date.";
  }
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

/**
 * Points offers that belong in a weekly OFFER carousel: the in-store boost
 * tier, which is where the supermarket gift-card promotions sit. Base earn
 * rates ("1 point per $1") and sign-up bonuses are standing facts about a
 * programme rather than this week's offers, and would crowd out the thing the
 * carousel exists to show.
 */
const CAROUSEL_POINTS_MECHANISM: PointsOffer["mechanism"] = "in-store-boost";

const UNKNOWN_DATE_SENTINEL = "9999-12-31";

/** A slide plus the keys the cross-pool order is decided on. */
interface TieredSlide {
  slide: MarqueeSlide;
  upcoming: boolean;
  start: string;
  end: string;
  checked: number;
  id: string;
}

/**
 * One order across both pools, reproducing exactly what each pool's own
 * comparator did on its own: every active offer first (ending soonest, then
 * most recently checked, then id), then every upcoming one (starting soonest,
 * then the same active tie-breaks). An upcoming offer can never sort above an
 * active one, which is what keeps the "Starts …" label honest.
 */
function compareTieredSlides(a: TieredSlide, b: TieredSlide): number {
  if (a.upcoming !== b.upcoming) return a.upcoming ? 1 : -1;
  if (a.upcoming && a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.end !== b.end) return a.end < b.end ? -1 : 1;
  if (a.checked !== b.checked) return b.checked - a.checked;
  return a.id.localeCompare(b.id);
}

function checkedMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * A reviewed points offer as a slide. Deliberately conservative: a points
 * offer never reduces the cash price, so `isRewardOnly` is always true and the
 * card renders the "rewards, not cash" line rather than a saving. The headline
 * is the offer's own earn-rate text — trimming it would misstate WHICH cards
 * qualify, which is the part a shopper is standing in the aisle checking.
 */
function pointsSlide(
  offer: PointsOffer,
  sellerLabel: string,
  now: Date,
): MarqueeSlide {
  const upcoming = pointsOfferDateState(offer, now) === "future";
  const citation = offer.citations[0];
  const programme = findRewardsProgramme(offer.program);
  const worked = buildWorkedExample(
    {
      promotionType: "points",
      discountPercent: 0,
      bonusPercent: null,
      pointsMultiplier: offer.earnMultiple,
      fixedPoints: offer.fixedPoints,
      pointsProgram: offer.program,
      pointsValueCents: offer.pointValueCents,
      fixedDiscountDollars: null,
      promoCreditDollars: null,
      feeWaiverDollars: null,
      thresholdDollars: null,
      capDollars: null,
    },
    MARQUEE_EXAMPLE_FACE_VALUE,
  );
  return {
    id: offer.id,
    detailHref: programme ? `/rewards/${programme.slug}` : "/rewards",
    mechanicLabel: "Points",
    // Same precedence as the gift-card badge: a per-dollar rate beats a lump
    // sum, because it is the figure that scales with what you spend.
    valueBadge: offer.earnMultiple
      ? `${offer.earnMultiple}× POINTS`
      : offer.fixedPoints
        ? `${offer.fixedPoints.toLocaleString("en-AU")} POINTS`
        : "POINTS",
    brandPrimary: offer.earnRateDisplay,
    headline: offer.earnRateDisplay,
    sellerLabel: sellerLabel || offer.program,
    sourceLabel: citation
      ? (SOURCE_META[citation.source]?.displayName ?? citation.source)
      : "Source unavailable",
    dateLabel: pointsOfferDateLabels(offer, now).join(" · "),
    // An upcoming offer must never carry active-sounding urgency — its only
    // date message is the explicit "Starts …" label.
    urgencyLabel: upcoming
      ? undefined
      : (expiryUrgencyLabelAU(offer.expiryDate, now) ?? undefined),
    trustLabel:
      offer.confidence === "confirmed"
        ? "Verified by DealStack"
        : "Source checked",
    compatibilityLabel: "Points offer — check the conditions",
    compatibilityTone: "neutral",
    isRewardOnly: true,
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
    caveat:
      offer.conditionsNote ??
      "Points are rewards, not cash — the price you pay is unchanged.",
  };
}

export function buildMarquee(
  offers: GiftCardOffer[],
  now: Date = new Date(),
  extras: {
    /** Reviewed points offers; only the in-store boost tier is carouselled. */
    points?: PointsOffer[];
    /** merchantId → store name, for a points offer's seller label. */
    storeNames?: Map<string, string>;
  } = {},
): MarqueeModel {
  // Every displayable offer becomes a slide — additional offers create
  // additional carousel pages; nothing is silently truncated. Active offers
  // come first, then upcoming ones with their explicit "Starts …" labels.
  const live = orderCurrentReviewedGiftCardOffers(offers, now);

  const giftCardSlides = live.map((offer): TieredSlide => {
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
      slide: {
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
      },
      upcoming: giftCardDateState(offer, now) === "future",
      start: offer.startDate ?? UNKNOWN_DATE_SENTINEL,
      end: offer.expiryDate ?? UNKNOWN_DATE_SENTINEL,
      checked: checkedMs(offer.lastCheckedAt),
      id: offer.id,
    };
  });

  // Same treatment for the points pool: its own read already dropped expired
  // rows, so only the carousel's own mechanism filter applies here.
  const livePoints = orderCurrentReviewedPointsOffers(
    (extras.points ?? []).filter(
      (offer) => offer.mechanism === CAROUSEL_POINTS_MECHANISM,
    ),
    now,
  );
  const pointsSlides = livePoints.map((offer): TieredSlide => {
    const sellerLabel = offer.merchantId
      ? (extras.storeNames?.get(offer.merchantId) ?? "")
      : "";
    return {
      slide: pointsSlide(offer, sellerLabel, now),
      upcoming: pointsOfferDateState(offer, now) === "future",
      start: offer.startsOn ?? UNKNOWN_DATE_SENTINEL,
      end: offer.expiryDate ?? UNKNOWN_DATE_SENTINEL,
      checked: checkedMs(offer.lastCheckedAt),
      id: offer.id,
    };
  });

  const merged = [...giftCardSlides, ...pointsSlides].sort(compareTieredSlides);

  return {
    slides: merged.map((entry) => entry.slide),
    liveCount: merged.length,
  };
}
