import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { estimateFirstYearValue } from "@/lib/offers/cardValue";
import { getCardOffers } from "@/lib/repos";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

export const metadata: Metadata = {
  title: "Compare card offers | DealStack AU",
  description: "Compare verified card fees, qualifying spend, staged bonuses and estimated first-year value.",
};

const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });

export default async function CompareCardsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids = "" } = await searchParams;
  const requested = [...new Set(ids.split(",").map((id) => id.trim()).filter(Boolean))].slice(0, 3);
  const all = await getCardOffers();
  const offers = requested.flatMap((id) => {
    const offer = all.find((item) => item.id === id);
    return offer ? [offer] : [];
  });

  return (
    <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link href="/cards" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Offers</Link>
        <h1 className="text-3xl font-bold">Compare card offers</h1>
        <p className="mt-2 text-sm text-muted-foreground">Figures include only verified, currently public offers. Point values are editorial estimates, not cash redemption guarantees.</p>
        {offers.length < 2 ? (
          <div className="mt-8 border-y py-10 text-center"><p className="text-sm text-muted-foreground">Choose at least two current offers from the cards page.</p><Button asChild className="mt-4"><Link href="/cards">Choose offers</Link></Button></div>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead><tr><th className="w-44 border-b p-3 text-left text-muted-foreground">Comparison</th>{offers.map((offer) => <th key={offer.id} className="border-b p-3 text-left"><Link className="font-semibold hover:underline" href={`/cards/${encodeURIComponent(offer.id)}`}>{offer.provider}<br /><span className="font-normal text-muted-foreground">{offer.cardName}</span></Link></th>)}</tr></thead>
              <tbody>
                {[
                  ["Headline bonus", (o: typeof offers[number]) => o.bonusPoints == null ? "—" : `${o.bonusPoints.toLocaleString("en-AU")} points`],
                  ["First-year points", (o: typeof offers[number]) => estimateFirstYearValue(o).firstYearPoints.toLocaleString("en-AU")],
                  ["Qualifying spend", (o: typeof offers[number]) => o.minimumSpend == null ? "—" : `${money.format(o.minimumSpend)}${o.minimumSpendPeriod ? ` in ${o.minimumSpendPeriod}` : ""}`],
                  ["Annual fee", (o: typeof offers[number]) => o.annualFee == null ? "—" : money.format(o.annualFee)],
                  ["Estimated first-year net", (o: typeof offers[number]) => { const value = estimateFirstYearValue(o).netValue; return value == null ? "Not available" : money.format(value); }],
                  ["Expiry", (o: typeof offers[number]) => o.expiryDate ?? "Ongoing"],
                  ["Review due", (o: typeof offers[number]) => o.reviewByDate],
                ].map(([label, render]) => <tr key={label as string}><th className="border-b p-3 text-left text-xs font-medium text-muted-foreground">{label as string}</th>{offers.map((offer) => <td key={offer.id} className="border-b p-3 align-top">{(render as (offer: typeof offers[number]) => string)(offer)}</td>)}</tr>)}
                <tr><th className="p-3" />{offers.map((offer) => { const source = safeHttpsUrl(offer.sourceUrl); return <td key={offer.id} className="p-3">{source ? <Button asChild variant="outline" size="sm"><a href={source} target="_blank" rel="nofollow noopener noreferrer">Issuer terms<ExternalLink /></a></Button> : null}</td>; })}</tr>
              </tbody>
            </table>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
