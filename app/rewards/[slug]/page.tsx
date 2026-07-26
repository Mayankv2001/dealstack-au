import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RewardsCalculator from "@/components/RewardsCalculator";
import RewardsSubnav from "@/components/RewardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import ProgrammeOfferList from "@/components/rewards/ProgrammeOfferList";
import { Card, CardContent } from "@/components/ui/card";
import {
  findRewardsProgramme,
  REWARDS_PROGRAMMES,
} from "@/lib/rewards/programmes";
import { feederOffersFor, offersForProgramme } from "@/lib/rewards/offerCounts";
import { bonusesInto } from "@/lib/rewards/transferBonus";
import {
  getCurrentReviewedPointsOffers,
  getGiftCardOffers,
  getTransferBonuses,
} from "@/lib/repos";

export function generateStaticParams() {
  return REWARDS_PROGRAMMES.map((programme) => ({ slug: programme.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const programme = findRewardsProgramme((await params).slug);
  return programme
    ? {
        title: `${programme.name} offers and calculator | DealStack AU`,
        description: programme.description,
      }
    : { title: "Rewards programme not found | DealStack AU" };
}

export const revalidate = 300;

export default async function RewardsDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const programme = findRewardsProgramme((await params).slug);
  if (!programme) notFound();
  const [pointsOffers, giftCardOffers, transferBonuses] = await Promise.all([
    getCurrentReviewedPointsOffers(),
    getGiftCardOffers(),
    getTransferBonuses(),
  ]);
  // Shared with the /rewards hub so the two can never disagree on the count.
  const ownOffers = offersForProgramme(programme, pointsOffers, giftCardOffers);
  // Offers that reach this programme via a transfer rather than directly, and
  // the bonuses running on that transfer right now. Both are empty for a
  // supermarket programme, which is the bottom of the chain.
  const feederGroups = feederOffersFor(programme, pointsOffers, giftCardOffers);
  const liveBonuses = bonusesInto(programme.slug, transferBonuses);
  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <RewardsSubnav current={programme.slug} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight">
          {programme.name}
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          {programme.description}
        </p>
        {programme.slug === "flybuys" ||
        programme.slug === "everyday-rewards" ? (
          <Link
            href={
              programme.slug === "flybuys"
                ? "/gift-cards/weekly?view=flybuys"
                : "/gift-cards/weekly?view=everyday-rewards"
            }
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2 text-sm font-semibold text-emerald-800 hover:border-emerald-500/60"
          >
            Weekly supermarket gift-card offers
          </Link>
        ) : null}
        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <RewardsCalculator
            programme={programme.name}
            defaultPointValueCents={programme.pointValueCents}
          />
          <Card>
            <CardContent className="p-5">
              <h2 className="font-semibold">Before you claim</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {programme.claimChecks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                {programme.transferNote}
              </p>
            </CardContent>
          </Card>
        </div>
        <ProgrammeOfferList
          programme={programme}
          offers={ownOffers}
          feederGroups={feederGroups}
          bonuses={liveBonuses}
        />
        <section className="mt-10 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold">How to use this programme safely</h2>
          <ol className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <li>
              1. Confirm the membership account is linked before purchase.
            </li>
            <li>2. Activate targeted boosts before the stated deadline.</li>
            <li>
              3. Check excluded products, transaction limits and credit timing.
            </li>
            <li>4. Keep estimated rewards separate from cash paid.</li>
          </ol>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
