import type { Metadata } from "next";
import { Info, Sparkles } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import RewardsSubnav from "@/components/RewardsSubnav";
import SavingsValueComparison from "@/components/SavingsValueComparison";
import ProgrammeGroups from "@/components/rewards/ProgrammeGroups";
import { getGiftCardOffers, getPointsOffers } from "@/lib/repos";

export const metadata: Metadata = {
  title: "Points and rewards | DealStack AU",
  description:
    "Reviewed Australian points opportunities, editable valuations and claim conditions for Everyday Rewards, Flybuys, Qantas and Velocity.",
};

export const revalidate = 300;

export default async function RewardsPage() {
  const [pointsOffers, giftCardOffers] = await Promise.all([
    getPointsOffers(),
    getGiftCardOffers(),
  ]);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page-container flex-1 py-8 sm:py-12">
        <RewardsSubnav />
        <section className="soft-panel grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow inline-flex items-center gap-2">
              <Sparkles aria-hidden className="size-4" /> Rewards calculators
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Points and rewards
            </h1>
            <p className="mt-2 text-lg font-semibold">
              Know what your points are worth
            </p>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Calculate points using a visible cents-per-point assumption.
              Rewards stay separate from today’s cash price, so the result is
              useful without being misleading.
            </p>
          </div>
          <div className="flex max-w-sm items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-950 dark:text-amber-200">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0" /> Points are
            not cash. Redemption value and transfer availability can change.
          </div>
        </section>

        <div className="mt-8">
          <p className="eyebrow">Choose a programme</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            Where the points land
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Grouped by the airline programme you redeem through. Supermarket
            points sit under the programme they transfer into, so you can see
            what you can earn and where it ends up in one place.
          </p>
        </div>
        <div className="mt-5">
          <ProgrammeGroups
            pointsOffers={pointsOffers}
            giftCardOffers={giftCardOffers}
          />
        </div>
        <SavingsValueComparison />
      </main>
      <SiteFooter />
    </div>
  );
}
