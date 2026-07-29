import Link from "next/link";
import { ArrowRight, Plane } from "lucide-react";
import ProgrammeOfferList, {
  HOME_OFFER_CAP,
} from "@/components/rewards/ProgrammeOfferList";
import type {
  GiftCardOffer,
  PointsOffer,
  PointsTransferBonus,
} from "@/lib/offers/types";
import { feederOffersFor, offersForProgramme } from "@/lib/rewards/offerCounts";
import { airlineProgrammes } from "@/lib/rewards/programmes";
import { bonusesInto } from "@/lib/rewards/transferBonus";

/**
 * The homepage lead: every current offer for each airline programme, in the
 * order you would redeem through them (Qantas, then Velocity).
 *
 * Deliberately the FULL list rather than a count — the site opens on what is
 * actually available today. Feeder offers are included because a Flybuys boost
 * IS a way to reach Velocity, and listing only the direct ones understates the
 * programme; ProgrammeOfferList labels them as earning elsewhere first so the
 * distinction is never lost.
 *
 * Rendering is delegated to ProgrammeOfferList, the same component
 * /rewards/[slug] uses, so the homepage cannot drift from the detail page it
 * links to. Here it is CAPPED — the uncapped page ran to ~5,800px, nearly all
 * of it the Velocity list — with the remainder one keystroke away behind a
 * native disclosure that names how many it is hiding.
 */
export function HomeProgrammeOffers({
  pointsOffers,
  giftCardOffers,
  transferBonuses,
}: {
  pointsOffers: PointsOffer[];
  giftCardOffers: GiftCardOffer[];
  transferBonuses: PointsTransferBonus[];
}) {
  const airlines = airlineProgrammes();

  return (
    <section
      className="page-container py-8 sm:py-10"
      aria-labelledby="home-programme-offers-heading"
    >
      <p className="eyebrow">Points and rewards</p>
      <h2
        id="home-programme-offers-heading"
        className="section-title mt-2"
      >
        Every current Qantas and Velocity offer
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Reviewed offers only, newest programme first. Points are rewards, not
        cash — estimated value is never subtracted from the price you pay.
      </p>

      <div className="mt-8 space-y-12">
        {airlines.map((programme) => {
          const ownOffers = offersForProgramme(
            programme,
            pointsOffers,
            giftCardOffers
          );
          const feederGroups = feederOffersFor(
            programme,
            pointsOffers,
            giftCardOffers
          );
          const bonuses = bonusesInto(programme.slug, transferBonuses);

          return (
            <div key={programme.slug}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Plane aria-hidden className="size-5 text-emerald-600" />
                  </span>
                  <h3 className="text-2xl font-black tracking-tight">
                    {programme.name}
                  </h3>
                </div>
                <Link
                  href={`/rewards/${programme.slug}`}
                  className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  {programme.shortName} calculator and detail{" "}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
              <ProgrammeOfferList
                programme={programme}
                offers={ownOffers}
                feederGroups={feederGroups}
                bonuses={bonuses}
                headingLevel="h4"
                ownOffersHeading={`${programme.shortName} offers`}
                cap={HOME_OFFER_CAP}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default HomeProgrammeOffers;
