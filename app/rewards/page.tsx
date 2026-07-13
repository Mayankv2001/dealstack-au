import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Coins } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { getGiftCardOffers, getPointsOffers } from "@/lib/repos";

export const metadata: Metadata = {
  title: "Rewards programmes | DealStack AU",
  description: "Reviewed Australian points opportunities, editable valuations and claim conditions for Everyday Rewards, Flybuys, Qantas and Velocity.",
};

export const revalidate = 300;

export default async function RewardsPage() {
  const [pointsOffers, giftCardOffers] = await Promise.all([
    getPointsOffers(),
    getGiftCardOffers(),
  ]);
  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Rewards intelligence</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Points without pretending they are cash</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">Compare current reviewed boosts, disclose the valuation assumption and keep future rewards separate from today’s checkout price.</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {REWARDS_PROGRAMMES.map((programme) => {
            const activeCount = pointsOffers.filter((offer) => offer.program.toLowerCase().includes(programme.shortName.toLowerCase())).length + giftCardOffers.filter((offer) => `${offer.pointsProgram ?? ""} ${offer.pointsOnPurchase?.program ?? ""}`.toLowerCase().includes(programme.shortName.toLowerCase())).length;
            return <Card key={programme.slug}><CardContent className="flex h-full flex-col p-5"><div className="flex items-center gap-2"><Coins aria-hidden className="size-5 text-amber-500" /><h2 className="text-lg font-semibold">{programme.name}</h2></div><p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{programme.description}</p><p className="mt-4 text-xs font-medium text-muted-foreground">{activeCount} current reviewed {activeCount === 1 ? "offer" : "offers"} · default {programme.pointValueCents}¢/point assumption</p><Link href={`/rewards/${programme.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">Open programme <ArrowRight aria-hidden className="size-4" /></Link></CardContent></Card>;
          })}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
