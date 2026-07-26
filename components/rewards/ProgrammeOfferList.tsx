import Link from "next/link";
import GiftCardOfferCard from "@/components/GiftCardOfferCard";
import PointsOfferCard from "@/components/rewards/PointsOfferCard";
import TransferBonusCallout from "@/components/rewards/TransferBonusCallout";
import type { PointsTransferBonus } from "@/lib/offers/types";
import type { FeederOffers, ProgrammeOffers } from "@/lib/rewards/offerCounts";
import {
  TRANSFER_BONUS_NOTE,
  transferRatioLabel,
  type RewardsProgramme,
} from "@/lib/rewards/programmes";

/**
 * Everything currently on offer for one programme: live transfer bonuses, the
 * programme's own gift-card and points offers, then the feeder programmes
 * whose points transfer into it.
 *
 * Shared by /rewards/[slug] and the homepage. Two copies of "what is on offer
 * for Velocity" would drift on the parts that matter most — whether a future
 * offer is labelled, whether a base ratio carries its bonus caveat — and a
 * shopper comparing the two pages would have no way to tell which was right.
 *
 * PRESENTATIONAL. Selection, ordering and currency are settled upstream by
 * lib/rewards/pointsOfferDates.ts and the repo reads.
 */

/**
 * Heading level, so the homepage can nest these under its own section h2 and
 * per-programme h3 without skipping a level — screen-reader navigation and the
 * e2e accessibility check both depend on the hierarchy staying ordered.
 */
type HeadingLevel = "h2" | "h3" | "h4";

function OfferGrids({ offers }: { offers: ProgrammeOffers }) {
  return (
    <>
      {offers.giftCards.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {offers.giftCards.map((offer) => (
            <GiftCardOfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      ) : null}
      {offers.points.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {offers.points.map((offer) => (
            <PointsOfferCard key={offer.id} offer={offer} />
          ))}
        </div>
      ) : null}
    </>
  );
}

export function ProgrammeOfferList({
  programme,
  offers,
  feederGroups,
  bonuses,
  headingLevel = "h2",
  ownOffersHeading = "Current reviewed offers",
}: {
  programme: RewardsProgramme;
  /** The programme's OWN offers — already filtered and ordered. */
  offers: ProgrammeOffers;
  /** Offers that reach this programme through a transfer. */
  feederGroups: FeederOffers[];
  /** Live transfer bonuses landing in this programme. */
  bonuses: PointsTransferBonus[];
  headingLevel?: HeadingLevel;
  ownOffersHeading?: string;
}) {
  const Heading = headingLevel;

  return (
    <>
      {bonuses.length > 0 ? (
        <section className="mt-6">
          <Heading className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Transfer bonus running now
          </Heading>
          <TransferBonusCallout bonuses={bonuses} className="mt-2" />
        </section>
      ) : null}

      <section className="mt-8">
        <Heading className="text-xl font-bold">{ownOffersHeading}</Heading>
        {offers.total === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            No current reviewed {programme.shortName} offers. New offers appear
            only after approval.
          </p>
        ) : (
          <OfferGrids offers={offers} />
        )}
      </section>

      {feederGroups.map(({ programme: feeder, offers: feederOffers }) => (
        <section key={feeder.slug} className="mt-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Heading className="text-xl font-bold">
              Earn {feeder.shortName}, transfer to {programme.shortName}
            </Heading>
            <Link
              href={`/rewards/${feeder.slug}`}
              className="text-sm font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              All {feeder.shortName} offers
            </Link>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            These offers earn {feeder.name} points, not {programme.shortName}{" "}
            points directly.{" "}
            {transferRatioLabel(feeder)
              ? `${transferRatioLabel(feeder)} at the base rate. `
              : ""}
            {TRANSFER_BONUS_NOTE}
          </p>
          <OfferGrids offers={feederOffers} />
        </section>
      ))}
    </>
  );
}

export default ProgrammeOfferList;
