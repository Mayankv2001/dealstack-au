import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX, Store } from "lucide-react";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { buildGiftCardOfferCardViewModel } from "@/lib/giftcards/offerCardViewModel";
import { getGiftCardOffers } from "@/lib/repos";

export const metadata: Metadata = {
  title: "Where to buy gift cards | DealStack AU",
  description:
    "Search current reviewed gift-card sellers without confusing the seller, issuer or discovery source.",
};

export const revalidate = 300;

type SearchParams = Promise<{ q?: string | string[] }>;

export default async function WhereToBuyPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const offers = await getGiftCardOffers();
  const needle = query.toLowerCase();
  const visible = offers.filter(
    (offer) =>
      !needle ||
      `${offer.brand} ${offer.source} ${offer.purchaseLocation ?? ""}`
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="page-container flex-1 py-7 sm:py-10">
        <GiftCardsSubnav current="/gift-cards/where-to-buy" />
        <div className="mt-6 border-b pb-6">
          <p className="eyebrow inline-flex items-center gap-2">
            <Store aria-hidden className="size-4" /> Seller lookup
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Where can I buy this gift card?
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Search a card brand or seller. Seller, card issuer and discovery
            source remain separate so you know who takes the payment.
          </p>
          <form
            action="/gift-cards/where-to-buy"
            role="search"
            className="mt-5 flex max-w-2xl gap-2"
          >
            <label htmlFor="seller-search" className="sr-only">
              Search gift-card brands or sellers
            </label>
            <input
              id="seller-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Apple, TCN, Woolworths, Coles…"
              className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:border-emerald-600 focus-visible:ring-4 focus-visible:ring-emerald-500/10"
            />
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>
        </div>

        {visible.length ? (
          <div className="mt-5 divide-y border-y">
            {visible.map((offer) => {
              const vm = buildGiftCardOfferCardViewModel(offer);
              return (
                <article
                  key={offer.id}
                  className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.55fr)_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Card
                    </p>
                    <h2 className="mt-1 font-bold">{vm.brandPrimary}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {vm.headline}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Buy from
                    </p>
                    <p className="mt-1 font-semibold">{vm.sellerLabel}</p>
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>
                        <dt className="inline font-semibold">Offer source: </dt>
                        <dd className="inline">{vm.sourceLabel}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold">Redeem at: </dt>
                        <dd className="inline">{vm.redeemAtLabel}</dd>
                      </div>
                    </dl>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {vm.dateLabel}
                    </p>
                  </div>
                  <Link
                    href={vm.detailHref}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-sm font-semibold hover:bg-muted"
                  >
                    Full conditions{" "}
                    <ArrowRight aria-hidden className="size-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 border-y py-10 text-center">
            <SearchX
              aria-hidden
              className="mx-auto size-7 text-muted-foreground"
            />
            <h2 className="mt-2 font-semibold">
              No current reviewed seller matches “{query}”
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a gift-card brand, supermarket or membership programme.
            </p>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
