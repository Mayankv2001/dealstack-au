import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  Gift,
  ShieldCheck,
} from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import StoreLogo from "@/components/StoreLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import { publicFreshness } from "@/lib/freshness";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import { getCashbackOffers, getStores } from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";

export const metadata: Metadata = {
  title: "Cashback offers | DealStack AU",
  description:
    "Compare current Australian cashback rates, caps, tracking conditions and known gift-card conflicts before adding cashback to a purchase plan.",
};

export const revalidate = 300;

function publicTerms(value: string): string {
  return value
    .replace(/^\s*sample\s*[:;\-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function CashbackPage() {
  const [offers, stores] = await Promise.all([
    getCashbackOffers(),
    getStores(),
  ]);
  const now = new Date();
  const storeById = new Map(stores.map((store) => [store.id, store]));
  const sorted = [...offers].sort((a, b) => b.ratePercent - a.ratePercent);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page-container flex-1 py-7 sm:py-10">
        <header className="grid gap-5 border-b pb-7 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow inline-flex items-center gap-2">
              <CircleDollarSign aria-hidden className="size-4" /> Cashback
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
              Compare cashback without hiding the catches
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              See the rate, cap, freshness and tracked-purchase conditions in
              one place. Add a store to the planner before assuming cashback
              works with a gift card or promo code.
            </p>
          </div>
          <Button asChild className="w-fit bg-emerald-700 text-white hover:bg-emerald-800">
            <Link href="/search">
              Plan a purchase <ArrowRight aria-hidden />
            </Link>
          </Button>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3" aria-label="How to read cashback offers">
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <ShieldCheck aria-hidden className="size-4 text-emerald-700" />
              Source status
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Confirms the recorded promotion—not every possible stack.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Clock3 aria-hidden className="size-4 text-emerald-700" />
              Freshness
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Shows when the rate was last checked by DealStack.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Gift aria-hidden className="size-4 text-amber-600" />
              Compatibility
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A confirmed rate can still conflict with gift-card payment.
            </p>
          </div>
        </section>

        <section className="mt-9" aria-labelledby="cashback-offers-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Current opportunities</p>
              <h2 id="cashback-offers-heading" className="mt-2 text-2xl font-black tracking-tight">
                Reviewed cashback offers
              </h2>
            </div>
            <Link href="/deals?kind=cashback" className="text-sm font-bold text-emerald-700 hover:underline">
              View in all deals
            </Link>
          </div>

          {sorted.length === 0 ? (
            <Card className="mt-5 border-dashed">
              <CardContent className="p-8 text-center">
                <h3 className="font-semibold">No current cashback offers are published</h3>
                <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
                  Reviewed rates will appear here after publication. You can
                  still plan a purchase using the other verified saving layers.
                </p>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/search">Open purchase planner</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-5 divide-y border-y">
              {sorted.map((offer) => {
                const store = storeById.get(offer.merchantId);
                const freshness = publicFreshness(offer.lastCheckedAt, now);
                const source = offer.citations[0];
                const expiry = expiryUrgencyLabelAU(offer.expiryDate, now);
                return (
                  <article
                    key={offer.id}
                    className="grid gap-4 py-5 sm:grid-cols-[3rem_minmax(0,1fr)_9rem_auto] sm:items-center"
                  >
                    <StoreLogo
                      store={store}
                      text={(store?.name ?? offer.provider).slice(0, 2).toUpperCase()}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-muted-foreground">
                        {store?.name ?? "Listed store"} · {offer.provider}
                      </p>
                      <h3 className="mt-1 font-bold leading-snug">
                        {offer.ratePercent}% cashback
                        {offer.capDollars != null
                          ? `, capped at ${formatAUD(offer.capDollars)}`
                          : ""}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {publicTerms(offer.termsSummary)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck aria-hidden className="size-3" />
                          {offer.confidence === "confirmed"
                            ? "Source confirmed"
                            : "Source needs recheck"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock3 aria-hidden className="size-3" />
                          {freshness.label}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {offer.excludesGiftCardPayment ? (
                            <AlertTriangle aria-hidden className="size-3 text-amber-600" />
                          ) : (
                            <Gift aria-hidden className="size-3" />
                          )}
                          {offer.excludesGiftCardPayment
                            ? "Conflicts with gift-card payment"
                            : "Gift-card compatibility unknown"}
                        </span>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-2xl font-black tracking-tight text-emerald-700">
                        {offer.ratePercent}%
                      </p>
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        {expiry ??
                          (offer.expiryDate
                            ? `Ends ${formatDateAU(offer.expiryDate)}`
                            : "No stated end date")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      {source ? (
                        <a
                          href={source.sourceUrl}
                          target="_blank"
                          rel="nofollow noopener noreferrer"
                          className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-semibold hover:bg-muted"
                        >
                          Source <ExternalLink aria-hidden className="size-3" />
                        </a>
                      ) : null}
                      <Link
                        href={`/search?q=${encodeURIComponent(store?.name ?? offer.merchantId)}&spend=500`}
                        className="inline-flex h-9 items-center rounded-lg bg-emerald-700 px-3 text-xs font-bold text-white hover:bg-emerald-800"
                      >
                        Add to plan
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <p className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-xs leading-relaxed text-muted-foreground">
          Cashback is normally paid after purchase and can be declined when
          tracking, coupon or payment conditions are not met. It is never
          presented as money removed from the checkout price.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
