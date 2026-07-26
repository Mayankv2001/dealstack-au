import Link from "next/link";
import { ArrowRight, Coins, Plane, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type {
  GiftCardOffer,
  PointsOffer,
  PointsTransferBonus,
} from "@/lib/offers/types";
import { countForProgramme } from "@/lib/rewards/offerCounts";
import {
  TRANSFER_BONUS_NOTE,
  TRANSFER_BONUS_SHORT,
  airlineProgrammes,
  feedersFor,
  transferRatioLabel,
} from "@/lib/rewards/programmes";
import { bonusHeadline, bonusesInto } from "@/lib/rewards/transferBonus";
import { formatDateAU } from "@/lib/sources/normalise";

/**
 * Points programmes grouped the way people actually plan: the airline
 * programme you redeem through, with the supermarket programmes that feed it
 * nested underneath (Coles/Flybuys → Velocity, Woolworths/Everyday Rewards →
 * Qantas).
 *
 * Every base transfer ratio renders with a bonus caveat beside it —
 * TRANSFER_BONUS_NOTE in full, TRANSFER_BONUS_SHORT when compact. A bare ratio
 * reads as a fixed promise, and it is neither ours to set nor stable; transfer
 * bonuses are exactly why the timing matters.
 *
 * `variant="compact"` is the homepage cut: same data and the same caveat,
 * without the programme descriptions.
 */

function offerCountLabel(count: number): string {
  if (count === 0) return "No reviewed offers yet";
  return `${count} reviewed ${count === 1 ? "offer" : "offers"}`;
}

function FeederRow({
  name,
  slug,
  ratio,
  count,
  compact,
}: {
  name: string;
  slug: string;
  ratio: string | null;
  count: number;
  compact: boolean;
}) {
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2.5">
      <div className="min-w-0">
        <Link
          href={`/rewards/${slug}`}
          className="text-sm font-semibold hover:underline"
        >
          {name}
        </Link>
        {ratio ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{ratio}</p>
        ) : null}
      </div>
      <p
        className={`text-xs font-semibold ${
          count === 0 ? "text-muted-foreground" : "text-emerald-700 dark:text-emerald-400"
        }`}
      >
        {compact
          ? count === 0
            ? "None yet"
            : `${count} ${count === 1 ? "offer" : "offers"}`
          : offerCountLabel(count)}
      </p>
    </li>
  );
}

export function ProgrammeGroups({
  pointsOffers,
  giftCardOffers,
  transferBonuses = [],
  variant = "full",
}: {
  pointsOffers: PointsOffer[];
  giftCardOffers: GiftCardOffer[];
  /** Live bonuses only — currency is settled by RLS before this point. */
  transferBonuses?: PointsTransferBonus[];
  variant?: "full" | "compact";
}) {
  const compact = variant === "compact";
  const airlines = airlineProgrammes();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {airlines.map((airline) => {
        const airlineCount = countForProgramme(
          airline,
          pointsOffers,
          giftCardOffers
        );
        const feeders = feedersFor(airline.slug);
        const liveBonuses = bonusesInto(airline.slug, transferBonuses);
        return (
          <Card
            key={airline.slug}
            className="border-0 shadow-sm ring-1 ring-foreground/10"
          >
            <CardContent className={compact ? "p-5" : "p-5 sm:p-6"}>
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Plane aria-hidden className="size-5 text-emerald-600" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <h3 className="text-lg font-bold">{airline.shortName}</h3>
                    <p className="text-xs font-semibold text-muted-foreground">
                      Default {airline.pointValueCents}¢ per point
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
                    {offerCountLabel(airlineCount)} earning directly
                  </p>
                </div>
              </div>

              {!compact ? (
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  {airline.description}
                </p>
              ) : null}

              {liveBonuses.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {liveBonuses.map((bonus) => {
                    const ends = formatDateAU(bonus.expiryDate);
                    return (
                      <li
                        key={bonus.id}
                        className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-3 py-2"
                      >
                        <TrendingUp
                          aria-hidden
                          className="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                            {bonusHeadline(bonus)}
                          </p>
                          {ends ? (
                            <p className="text-xs font-semibold text-emerald-800/80 dark:text-emerald-300/80">
                              Ends {ends}
                            </p>
                          ) : null}
                          {!compact && bonus.conditionsNote ? (
                            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                              {bonus.conditionsNote}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {feeders.length > 0 ? (
                <div className="mt-4 rounded-xl border border-dashed bg-muted/40 px-4 py-2">
                  <p className="flex items-center gap-1.5 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    <Coins aria-hidden className="size-3.5" />
                    Earn here, transfer in
                  </p>
                  <ul className="divide-y">
                    {feeders.map((feeder) => (
                      <FeederRow
                        key={feeder.slug}
                        name={feeder.name}
                        slug={feeder.slug}
                        ratio={transferRatioLabel(feeder)}
                        count={countForProgramme(
                          feeder,
                          pointsOffers,
                          giftCardOffers
                        )}
                        compact={compact}
                      />
                    ))}
                  </ul>
                  {compact ? (
                    <p className="pb-2 text-[11px] leading-relaxed text-muted-foreground">
                      {TRANSFER_BONUS_SHORT}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
                {!compact ? (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {TRANSFER_BONUS_NOTE}
                  </p>
                ) : (
                  <span />
                )}
                <Link
                  href={`/rewards/${airline.slug}`}
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Open <ArrowRight aria-hidden className="size-4" />
                </Link>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default ProgrammeGroups;
