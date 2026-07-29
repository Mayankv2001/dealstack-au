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

/** How many offers each grid shows before the rest go behind a disclosure. */
export interface OfferCap {
  giftCards: number;
  points: number;
}

/**
 * Chosen against the grid columns below so the visible set is WHOLE ROWS at
 * every breakpoint, not a ragged half-row:
 *   gift cards — sm:grid-cols-2 lg:grid-cols-3 → 6 is 3×2 and 2×3
 *   points     — sm:grid-cols-2               → 4 is 2×2
 */
export const HOME_OFFER_CAP: OfferCap = { giftCards: 6, points: 4 };

/**
 * Below this many hidden, the disclosure costs the reader more than the
 * length it saves — one card behind a "Show 1 more" toggle is worse than one
 * extra card. Those grids render in full instead, ragged final row and all.
 */
const MIN_WORTH_COLLAPSING = 2;

function CappedGrid<T extends { id: string }>({
  items,
  cap,
  gridClassName,
  label,
  render,
}: {
  items: T[];
  /** Undefined means show everything — the default for /rewards/[slug]. */
  cap: number | undefined;
  gridClassName: string;
  /** Names what is hidden, e.g. "Velocity" → "Show 6 more Velocity offers". */
  label: string;
  render: (item: T) => React.ReactNode;
}) {
  if (items.length === 0) return null;

  const hiddenCount = cap === undefined ? 0 : items.length - cap;
  const collapse = hiddenCount >= MIN_WORTH_COLLAPSING;
  const visible = collapse ? items.slice(0, cap) : items;
  const hidden = collapse ? items.slice(cap) : [];

  return (
    <>
      <div className={gridClassName}>{visible.map(render)}</div>
      {hidden.length > 0 ? (
        // Native <details>: no hydration, works with JS off, keyboard
        // accessible for free, and every offer stays in the server-rendered
        // HTML. The grid sits INSIDE the details rather than being one, so
        // the disclosure cannot disturb the grid's own layout.
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-400">
            Show {hidden.length} more {label}{" "}
            {hidden.length === 1 ? "offer" : "offers"}
          </summary>
          <div className={`${gridClassName} mt-3`}>{hidden.map(render)}</div>
        </details>
      ) : null}
    </>
  );
}

function OfferGrids({
  offers,
  cap,
  label,
}: {
  offers: ProgrammeOffers;
  cap?: OfferCap;
  label: string;
}) {
  return (
    <>
      <CappedGrid
        items={offers.giftCards}
        cap={cap?.giftCards}
        gridClassName="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        label={label}
        render={(offer) => <GiftCardOfferCard key={offer.id} offer={offer} />}
      />
      <CappedGrid
        items={offers.points}
        cap={cap?.points}
        gridClassName="mt-4 grid gap-3 sm:grid-cols-2"
        label={label}
        render={(offer) => <PointsOfferCard key={offer.id} offer={offer} />}
      />
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
  cap,
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
  /**
   * Show only this many per grid, rest behind a disclosure. OPT-IN: omitting
   * it shows everything, which is what /rewards/[slug] needs — it is the
   * destination the capped homepage links to, so capping it too would leave
   * nowhere to read the full list.
   */
  cap?: OfferCap;
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
          <OfferGrids
            offers={offers}
            cap={cap}
            label={programme.shortName}
          />
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
          <OfferGrids
            offers={feederOffers}
            cap={cap}
            label={feeder.shortName}
          />
        </section>
      ))}
    </>
  );
}

export default ProgrammeOfferList;
