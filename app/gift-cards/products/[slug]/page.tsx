import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GiftCardOfferCard from "@/components/GiftCardOfferCard";
import ReportProblemForm from "@/components/ReportProblemForm";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getAllGiftCardAcceptance, getAllGiftCardProducts, getGiftCardOffers } from "@/lib/repos";
import { formatDateAU } from "@/lib/sources/normalise";

export const revalidate = 300;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const products = await getAllGiftCardProducts();
  const product = products.find((item) => item.slug === slug);
  return product
    ? { title: `${product.brand} gift card | DealStack AU` }
    : { title: "Gift card product not found | DealStack AU" };
}

export default async function GiftCardProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const [products, acceptance, offers] = await Promise.all([getAllGiftCardProducts(), getAllGiftCardAcceptance(), getGiftCardOffers()]);
  const product = products.find((item) => item.slug === slug);
  if (!product) notFound();
  const rows = acceptance.filter((row) => row.productId === product.id);
  const currentOffers = offers.filter((offer) => [offer.productId, ...(offer.includedProductIds ?? [])].includes(product.id));
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><h1 className="text-3xl font-bold tracking-tight">{product.brand}</h1><p className="mt-2 text-muted-foreground">Reviewed product facts and published acceptance evidence—not a guarantee that every terminal will route identically.</p><ReportProblemForm entityType="gift-card-product" entityId={product.id} /><div className="mt-7 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"><Card><CardContent className="p-5"><h2 className="font-semibold">Product facts</h2><dl className="mt-3 divide-y text-sm">{[["Issuer", product.issuer ?? "Not recorded"],["Format", product.format.replaceAll("-", " ")],["Network", product.cardNetwork ?? "Not recorded"],["Variable load", product.variableLoad == null ? "Not recorded" : product.variableLoad ? "Yes" : "No"],["Denominations", product.minDenomination != null && product.maxDenomination != null ? `$${product.minDenomination}–$${product.maxDenomination}` : "Not recorded"],["Mobile wallet", product.mobileWallet]].map(([label, value]) => <div key={label} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>)}</dl></CardContent></Card><Card><CardContent className="p-5"><h2 className="font-semibold">Where it has been recorded</h2>{rows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Not recorded. This does not mean the card is not accepted.</p> : <ul className="mt-3 divide-y">{rows.map((row) => <li key={row.id} className="py-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{row.merchantName ?? row.merchantCategory ?? row.storeId ?? "Unnamed merchant"}</span><span className={row.outcome === "unsuccessful" ? "text-red-700" : "text-emerald-700"}>{row.outcome === "unsuccessful" ? "Known unsuccessful" : row.status === "verified" ? "Verified by DealStack" : row.status === "claimed" ? "Claimed by issuer" : "Community reported"}</span></div>{row.checkedAt ? <p className="mt-1 text-xs text-muted-foreground">Checked {formatDateAU(row.checkedAt.slice(0,10))}</p> : null}<ReportProblemForm entityType="gift-card-acceptance" entityId={row.id} compact /></li>)}</ul>}<p className="mt-4 text-xs text-muted-foreground">MCC-dependent acceptance may differ by terminal, merchant configuration and transaction type.</p></CardContent></Card></div><section className="mt-10"><h2 className="text-xl font-bold">Current reviewed offers</h2>{currentOffers.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{currentOffers.map((offer) => <GiftCardOfferCard key={offer.id} offer={offer} />)}</div> : <p className="mt-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground">No current reviewed offers for this product.</p>}</section><section className="mt-10 rounded-2xl border bg-card p-5"><h2 className="font-semibold">Before buying</h2><ul className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"><li>• Check activation and tampering before leaving the seller.</li><li>• Confirm the exact included card variant and denomination.</li><li>• Treat “not recorded” as unknown, not rejected.</li><li>• Recheck cashback and card-linked-offer exclusions.</li></ul></section></main><SiteFooter /></div>;
}
