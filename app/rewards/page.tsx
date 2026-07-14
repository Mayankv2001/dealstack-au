import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Coins, Info, Sparkles } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import RewardsSubnav from "@/components/RewardsSubnav";
import SavingsValueComparison from "@/components/SavingsValueComparison";
import { Card, CardContent } from "@/components/ui/card";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
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

        <div className="mt-8 flex items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Choose a programme</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">
              Open a calculator and current offers
            </h2>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {REWARDS_PROGRAMMES.map((programme) => {
            const activeCount =
              pointsOffers.filter((offer) =>
                offer.program
                  .toLowerCase()
                  .includes(programme.shortName.toLowerCase()),
              ).length +
              giftCardOffers.filter((offer) =>
                `${offer.pointsProgram ?? ""} ${offer.pointsOnPurchase?.program ?? ""}`
                  .toLowerCase()
                  .includes(programme.shortName.toLowerCase()),
              ).length;
            return (
              <Card
                key={programme.slug}
                className="border-0 shadow-sm ring-1 ring-foreground/10 transition hover:-translate-y-0.5 hover:ring-emerald-500/40 hover:shadow-md"
              >
                <CardContent className="flex h-full flex-col p-5 sm:p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-xl bg-amber-500/10">
                      <Coins aria-hidden className="size-5 text-amber-600" />
                    </span>
                    <div>
                      <h3 className="text-lg font-bold">{programme.name}</h3>
                      <p className="text-xs font-semibold text-muted-foreground">
                        Default {programme.pointValueCents}¢ per point
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {programme.description}
                  </p>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
                    <p className="text-xs font-semibold text-muted-foreground">
                      {activeCount} reviewed{" "}
                      {activeCount === 1 ? "offer" : "offers"}
                    </p>
                    <Link
                      href={`/rewards/${programme.slug}`}
                      className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
                    >
                      Open <ArrowRight aria-hidden className="size-4" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <SavingsValueComparison />
      </main>
      <SiteFooter />
    </div>
  );
}
