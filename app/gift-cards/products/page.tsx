import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { getAllGiftCardAcceptance, getAllGiftCardProducts } from "@/lib/repos";

export const metadata: Metadata = { title: "Gift-card product directory | DealStack AU", description: "Reviewed gift-card products, denominations, formats, wallet support and merchant-acceptance evidence." };
export const revalidate = 300;

type SearchParams = { q?: string | string[] };

export default async function GiftCardProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim() ?? "";
  const needle = query.toLowerCase();
  const [products, acceptance] = await Promise.all([getAllGiftCardProducts(), getAllGiftCardAcceptance()]);
  const countByProduct = new Map<string, number>();
  acceptance.forEach((row) => countByProduct.set(row.productId, (countByProduct.get(row.productId) ?? 0) + 1));
  const visibleProducts = products.filter((product) => !needle || `${product.brand} ${product.issuer ?? ""} ${product.cardNetwork ?? ""} ${product.format}`.toLowerCase().includes(needle));
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6"><h1 className="text-3xl font-bold tracking-tight">Gift-card product directory</h1><p className="mt-2 max-w-3xl text-muted-foreground">Products are separate from short-term offers. Every acceptance fact must cross the admin review boundary.</p><form action="/gift-cards/products" role="search" className="mt-6 flex max-w-xl gap-2"><label htmlFor="product-search" className="sr-only">Search gift-card products</label><input id="product-search" name="q" type="search" defaultValue={query} placeholder="Search brand, issuer, network or format" className="h-11 min-w-0 flex-1 rounded-xl border bg-background px-3" /><button className="rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white">Search</button></form>{visibleProducts.length === 0 ? <Card className="mt-7"><CardContent className="flex flex-col items-center py-10 text-center"><SearchX className="size-8 text-muted-foreground" /><h2 className="mt-3 font-semibold">{query ? `No products match “${query}”` : "No public products yet"}</h2><p className="mt-1 max-w-lg text-sm text-muted-foreground">{query ? "Try a brand, issuer, card network or format." : "Products will appear after active records and their evidence are approved. “Not recorded” does not mean a card is not accepted."}</p></CardContent></Card> : <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visibleProducts.map((product) => <Card key={product.id}><CardContent className="p-5"><h2 className="font-semibold">{product.brand}</h2><p className="mt-1 text-sm text-muted-foreground">{product.issuer ?? "Issuer not recorded"} · {product.format.replaceAll("-", " ")}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-muted-foreground">Denominations</dt><dd className="font-medium">{product.minDenomination != null && product.maxDenomination != null ? `$${product.minDenomination}–$${product.maxDenomination}` : "Not recorded"}</dd></div><div><dt className="text-muted-foreground">Wallet</dt><dd className="font-medium">{product.mobileWallet}</dd></div><div><dt className="text-muted-foreground">Acceptance facts</dt><dd className="font-medium">{countByProduct.get(product.id) ?? 0}</dd></div><div><dt className="text-muted-foreground">Network</dt><dd className="font-medium">{product.cardNetwork ?? "Not recorded"}</dd></div></dl><Link href={`/gift-cards/products/${product.slug}`} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">View product <ArrowRight className="size-4" /></Link></CardContent></Card>)}</div>}</main><SiteFooter /></div>;
}
