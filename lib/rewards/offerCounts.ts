import type { GiftCardOffer, PointsOffer } from "@/lib/offers/types";
import { feedersFor, type RewardsProgramme } from "@/lib/rewards/programmes";

/**
 * How many reviewed offers a programme currently has.
 *
 * PURE — takes already-filtered repo output, so it counts exactly what the
 * public can see and nothing else. Extracted because /rewards and
 * /rewards/[slug] each had their own copy of this matching; two copies of a
 * "how many offers" rule is how a hub ends up disagreeing with the page it
 * links to.
 *
 * Matching is a substring test on the programme's short name because the
 * `program` column is free text authored in admin ("Qantas",
 * "3 Qantas pts per $1 (Qantas Shopping)"), not an enum.
 */

/** Does this free-text programme name refer to `programme`? */
export function matchesProgramme(
  value: string | null | undefined,
  programme: RewardsProgramme
): boolean {
  if (!value) return false;
  return value.toLowerCase().includes(programme.shortName.toLowerCase());
}

export interface ProgrammeOffers {
  points: PointsOffer[];
  giftCards: GiftCardOffer[];
  total: number;
}

/** Split the reviewed pools down to just this programme's offers. */
export function offersForProgramme(
  programme: RewardsProgramme,
  pointsOffers: PointsOffer[],
  giftCardOffers: GiftCardOffer[]
): ProgrammeOffers {
  const points = pointsOffers.filter((offer) =>
    matchesProgramme(offer.program, programme)
  );
  const giftCards = giftCardOffers.filter((offer) =>
    matchesProgramme(
      `${offer.pointsProgram ?? ""} ${offer.pointsOnPurchase?.program ?? ""}`,
      programme
    )
  );
  return { points, giftCards, total: points.length + giftCards.length };
}

export interface FeederOffers {
  programme: RewardsProgramme;
  offers: ProgrammeOffers;
}

/**
 * Offers that earn into `programme` INDIRECTLY — a supermarket programme's own
 * offers, listed under the airline programme its points transfer to.
 *
 * The `program` column names the programme where the points land first
 * ("Flybuys"), so a Coles boost never matches "Velocity" and the Velocity page
 * used to omit the biggest reason to earn Flybuys at all. Feeders come from the
 * editorial `transfer` links in programmes.ts, not from the offer text.
 *
 * Feeders with nothing current are dropped: an empty programme heading reads as
 * a broken section, and the count is already on the /rewards hub. Returns an
 * empty array for supermarket programmes, which have no feeders of their own.
 */
export function feederOffersFor(
  programme: RewardsProgramme,
  pointsOffers: PointsOffer[],
  giftCardOffers: GiftCardOffer[]
): FeederOffers[] {
  return feedersFor(programme.slug)
    .map((feeder) => ({
      programme: feeder,
      offers: offersForProgramme(feeder, pointsOffers, giftCardOffers),
    }))
    .filter((group) => group.offers.total > 0);
}

/** Convenience for the card chrome — just the number. */
export function countForProgramme(
  programme: RewardsProgramme,
  pointsOffers: PointsOffer[],
  giftCardOffers: GiftCardOffer[]
): number {
  return offersForProgramme(programme, pointsOffers, giftCardOffers).total;
}
