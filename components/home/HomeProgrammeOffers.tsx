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
import type { RewardsProgramme } from "@/lib/rewards/programmes";
import {
  programmeTabHref,
  programmeTabs,
} from "@/lib/rewards/programmeTabs";
import { bonusesInto } from "@/lib/rewards/transferBonus";

/**
 * The homepage lead: every current offer for ONE airline programme, chosen by
 * a tab strip. Both programmes stacked made the page very long and buried the
 * second one; a tab shows the whole of what you picked instead of a little of
 * each.
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
 *
 * The tab is URL state, not component state: server-rendered links, so a tab
 * is shareable, survives back/forward, and needs no client JS — matching the
 * gift-cards weekly views rather than inventing a second pattern.
 */
export function HomeProgrammeOffers({
  pointsOffers,
  giftCardOffers,
  transferBonuses,
  active,
}: {
  pointsOffers: PointsOffer[];
  giftCardOffers: GiftCardOffer[];
  transferBonuses: PointsTransferBonus[];
  /** Already resolved from ?programme= by parseProgrammeTab. */
  active: RewardsProgramme;
}) {
  const tabs = programmeTabs();
  const ownOffers = offersForProgramme(active, pointsOffers, giftCardOffers);
  const feederGroups = feederOffersFor(active, pointsOffers, giftCardOffers);
  const bonuses = bonusesInto(active.slug, transferBonuses);

  return (
    <section
      className="page-container py-8 sm:py-10"
      aria-labelledby="home-programme-offers-heading"
    >
      <p className="eyebrow">Points and rewards</p>
      <h2 id="home-programme-offers-heading" className="section-title mt-2">
        Every current {active.shortName} offer
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        Reviewed offers only, ending soonest first. Points are rewards, not
        cash — estimated value is never subtracted from the price you pay.
      </p>

      {/* Links, not buttons: each tab is a real URL, so it is shareable and
          back/forward work without any client JS. */}
      <nav
        aria-label="Points programme"
        className="mt-5 flex gap-1.5 overflow-x-auto pb-1"
      >
        {tabs.map((tab) => {
          const current = tab.slug === active.slug;
          return (
            <Link
              key={tab.slug}
              href={programmeTabHref(tab)}
              aria-current={current ? "page" : undefined}
              className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold ${
                current
                  ? "border-emerald-700 bg-emerald-700 text-white"
                  : "bg-card text-muted-foreground hover:border-emerald-500/50"
              }`}
            >
              {tab.shortName}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-3">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
              <Plane aria-hidden className="size-5 text-emerald-600" />
            </span>
            <h3 className="text-2xl font-black tracking-tight">
              {active.name}
            </h3>
          </div>
          <Link
            href={`/rewards/${active.slug}`}
            className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-400"
          >
            {active.shortName} calculator and detail{" "}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        <ProgrammeOfferList
          programme={active}
          offers={ownOffers}
          feederGroups={feederGroups}
          bonuses={bonuses}
          headingLevel="h4"
          ownOffersHeading={`${active.shortName} offers`}
          cap={HOME_OFFER_CAP}
        />
      </div>
    </section>
  );
}

export default HomeProgrammeOffers;
