import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calculator, TriangleAlert } from "lucide-react";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import { getGiftCardOffers, getStores } from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  buildWeeklyPurchasePlan,
  isWeeklySupermarketOffer,
} from "@/lib/giftcards/weeklyOffers";

export const metadata: Metadata = {
  title: "Plan with a weekly gift-card offer | DealStack AU",
  robots: { index: false, follow: true },
};
export const revalidate = 300;

const first = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

export default async function WeeklyGiftCardPlanPage({
  searchParams,
}: {
  searchParams: Promise<{
    offer?: string | string[];
    spend?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const offerId = first(params.offer) ?? "";
  const requestedSpend = Number(first(params.spend));
  const spend =
    Number.isFinite(requestedSpend) && requestedSpend > 0
      ? Math.min(requestedSpend, 100_000)
      : 500;
  const [offers, stores] = await Promise.all([getGiftCardOffers(), getStores()]);
  const offer = offers.find(
    (candidate) =>
      candidate.id === offerId && isWeeklySupermarketOffer(candidate),
  );
  const plan = offer ? buildWeeklyPurchasePlan(offer, spend) : null;
  const merchant = plan?.redemptionMerchantId
    ? stores.find((store) => store.id === plan.redemptionMerchantId)
    : null;

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <GiftCardsSubnav current="/gift-cards/weekly" />
        {!offer || !plan ? (
          <Card className="mt-6 border-dashed">
            <CardContent className="p-10 text-center">
              <h1 className="text-xl font-bold">This weekly offer is not currently available</h1>
              <p className="mt-2 text-sm text-muted-foreground">It may be expired, unpublished, or missing confirmed weekly dates.</p>
              <Link href="/gift-cards/weekly" className="mt-4 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold">Return to weekly offers</Link>
            </CardContent>
          </Card>
        ) : (
          <>
            <header className="mt-6">
              <p className="eyebrow inline-flex items-center gap-2"><Calculator aria-hidden className="size-4" /> Gift-card purchase planner</p>
              <h1 className="mt-3 text-3xl font-black tracking-tight">Plan {formatAUD(spend)} with {offer.brand}</h1>
              <p className="mt-2 text-sm text-muted-foreground">Buy from {offer.purchaseLocation ?? offer.source} · active {formatDateAU(offer.startDate!)}–{formatDateAU(offer.expiryDate!)}</p>
            </header>
            <form className="mt-5 flex max-w-md gap-2" action="/gift-cards/weekly/plan">
              <input type="hidden" name="offer" value={offer.id} />
              <label className="flex-1 text-xs font-semibold">Expected spend<input name="spend" type="number" min="1" max="100000" step="0.01" defaultValue={spend} className="mt-1 h-10 w-full rounded-lg border bg-background px-3 text-sm" /></label>
              <button className="mt-5 h-10 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">Recalculate</button>
            </form>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Immediate cash paid", formatAUD(plan.cashPaid)],
                ["Immediate cash saving", formatAUD(plan.immediateCashSaving)],
                ["Bonus card value", plan.bonusCardValue == null ? "None" : formatAUD(plan.bonusCardValue)],
                ["Estimated rewards value", plan.estimatedRewardsValue == null ? "None" : `~${formatAUD(plan.estimatedRewardsValue)}`],
              ].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-xl font-black">{value}</p></CardContent></Card>)}
            </div>
            <Card className="mt-5">
              <CardContent className="grid gap-5 p-5 lg:grid-cols-2">
                <div>
                  <h2 className="font-bold">Card quantity and limits</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-xs text-muted-foreground">Required cards</dt><dd className="font-semibold">{plan.requiredCardQuantity ?? "Cannot calculate"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Shopping days</dt><dd className="font-semibold">{plan.shoppingDays ?? "Not determined"}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Maximum eligible</dt><dd className="font-semibold">{plan.maximumEligiblePurchase == null ? "Not recorded" : formatAUD(plan.maximumEligiblePurchase)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Unused balance</dt><dd className="font-semibold">{plan.unusedGiftCardBalance == null ? "Cannot calculate" : formatAUD(plan.unusedGiftCardBalance)}</dd></div>
                  </dl>
                </div>
                <div>
                  <h2 className="font-bold">Suggested denomination mix</h2>
                  {plan.cardMix ? <ul className="mt-3 space-y-1 text-sm">{plan.cardMix.map((item) => <li key={item.denomination}>{item.count} × {formatAUD(item.denomination)}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Denominations are not sufficiently structured to calculate a mix.</p>}
                </div>
              </CardContent>
            </Card>
            {plan.pointsEarned != null ? <p className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm">Estimated points earned: <strong>{plan.pointsEarned.toLocaleString("en-AU")}</strong>. Points are not cash and do not reduce the amount paid.</p> : null}
            <section className="mt-5 rounded-2xl border bg-card p-5">
              <h2 className="flex items-center gap-2 font-bold"><TriangleAlert aria-hidden className="size-4 text-amber-600" /> Conditions still requiring attention</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{plan.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </section>
            {merchant ? (
              <Link href={`/search?q=${encodeURIComponent(merchant.name)}&spend=${spend}`} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-bold text-white">Continue to the {merchant.name} compatibility plan <ArrowRight aria-hidden className="size-4" /></Link>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">DealStack cannot map this card to one redemption merchant from approved evidence, so it remains in the gift-card-specific planner instead of guessing.</p>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
