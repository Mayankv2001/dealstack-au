import type { GiftCardOffer, PointsOffer } from "@/lib/offers/types";
import type { RewardsProgramme } from "@/lib/rewards/programmes";

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

/** Convenience for the card chrome — just the number. */
export function countForProgramme(
  programme: RewardsProgramme,
  pointsOffers: PointsOffer[],
  giftCardOffers: GiftCardOffer[]
): number {
  return offersForProgramme(programme, pointsOffers, giftCardOffers).total;
}
