import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import GiftCardsSubnav from "@/components/GiftCardsSubnav";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import ReportProblemForm from "@/components/ReportProblemForm";
import { Card, CardContent } from "@/components/ui/card";
import { searchGiftCardAcceptance } from "@/lib/giftcards/searchAcceptance";
import { getAllGiftCardAcceptance, getAllGiftCardProducts } from "@/lib/repos";

export const metadata: Metadata = { title: "Where to use gift cards | DealStack AU", description: "Search reviewed gift-card acceptance evidence in both directions: card to merchants and merchant to cards." };
export const revalidate = 300;
type Params = { q?: string | string[] };
export default async function WhereToUsePage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const [products, acceptance] = await Promise.all([
    getAllGiftCardProducts(),
    getAllGiftCardAcceptance(),
  ]);
  const rows = searchGiftCardAcceptance(products, acceptance, query);
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><GiftCardsSubnav current="/gift-cards/where-to-use" /><h1 className="mt-4 text-3xl font-bold tracking-tight">Where to use gift cards</h1><p className="mt-2 max-w-3xl text-muted-foreground">Search a merchant to find recorded cards, or a card to find recorded merchants. Unknown evidence stays unknown.</p><form action="/gift-cards/where-to-use" className="mt-6 flex max-w-xl gap-2"><label htmlFor="acceptance-search" className="sr-only">Search cards or merchants</label><input id="acceptance-search" name="q" type="search" defaultValue={query} placeholder="e.g. JB Hi-Fi or Ultimate" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3" /><button className="rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">Search</button></form>{rows.length === 0 ? <Card className="mt-7"><CardContent className="p-8 text-center"><h2 className="font-semibold">{query ? `No recorded evidence for “${query}”` : "No published acceptance evidence yet"}</h2><p className="mt-1 text-sm text-muted-foreground">This is “not recorded”, not “not accepted”. Check the issuer and retailer before buying.</p><p className="mt-1 text-sm text-muted-foreground">Current offers list the retailers named on each reviewed offer.</p><Link href="/gift-cards" className="mt-4 inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold hover:border-emerald-500/50">Browse current offers <ArrowRight className="size-4" /></Link></CardContent></Card> : <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{rows.map(({ product, row }) => <Card key={row.id}><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{product.brand}</p><h2 className="mt-1 font-semibold">{row.merchantName ?? row.merchantCategory ?? row.storeId ?? "Merchant not named"}</h2><p className={`mt-3 text-sm font-medium ${row.outcome === "unsuccessful" ? "text-red-700" : "text-emerald-700"}`}>{row.outcome === "unsuccessful" ? "Known unsuccessful" : row.status === "verified" ? "Verified by DealStack" : row.status === "claimed" ? "Claimed by issuer" : "Community reported"}</p><ReportProblemForm entityType="gift-card-acceptance" entityId={row.id} compact /></CardContent></Card>)}</div>}<p className="mt-6 text-xs leading-relaxed text-muted-foreground">MCC evidence is directional and can vary by terminal or merchant configuration. A successful report is not a guarantee; an absent report is not a rejection.</p></main><SiteFooter /></div>;
}
