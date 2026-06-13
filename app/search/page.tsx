import type { Metadata } from "next";
import Link from "next/link";
import { FileSearch, SearchX, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import SourceResultCard from "@/components/SourceResultCard";
import StoreCard from "@/components/StoreCard";
import { stores, type Store } from "@/lib/data";
import { searchSources } from "@/lib/sources/searchSources";

export const metadata: Metadata = {
  title: "Search stores — DealStack AU",
};

function matchesQuery(store: Store, query: string) {
  const haystack = [
    store.name,
    store.category,
    store.discountCode,
    store.cashbackProvider,
    store.giftCardSource,
    store.pointsProgram,
    store.pointsRate,
  ]
    .join(" ")
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const results = query ? stores.filter((s) => matchesQuery(s, query)) : stores;
  const sourceResults = searchSources(query);

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">Weekly Deals</Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="hidden sm:inline-flex">
              <Link href="/resources">Resources</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="bg-background">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          {query ? (
            <>
              Results for <span className="text-primary">“{query}”</span>
            </>
          ) : (
            "Search stores"
          )}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {results.length === 0
            ? "No matching stores"
            : `${results.length} ${results.length === 1 ? "store" : "stores"} with stackable savings`}
        </p>

        <SearchBar defaultValue={query} className="mt-3 max-w-md" />

        {results.length === 0 ? (
          <Card className="mt-5 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="font-medium">Nothing matches “{query}”</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Try a store name like Myer or JB Hi-Fi, a category like
                groceries, or a provider like ShopBack or Flybuys.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-2">
                <Link href="/search">Browse all stores</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        )}

        {/* Checked sources (static/mock pipeline — no live fetching) */}
        <section className="mt-8">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-lg font-bold tracking-tight sm:text-xl">
              Checked sources
            </h2>
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {sourceResults.length === 0
              ? "Deal listings from OzBargain, Point Hacks, FreePoints and GCDB"
              : `${sourceResults.length} ${sourceResults.length === 1 ? "listing" : "listings"} found across OzBargain, Point Hacks, FreePoints, GCDB and DealStack-verified entries`}
          </p>

          {sourceResults.length === 0 ? (
            <Card className="mt-3 shadow-sm">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <FileSearch className="size-8 text-muted-foreground" />
                <p className="font-medium">
                  No source listings match “{query}”
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Try a store name, a points program like Qantas or Flybuys, or
                  a deal type like gift cards.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sourceResults.map((result) => (
                <SourceResultCard key={result.id} result={result} />
              ))}
            </div>
          )}

          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            These are example/static source checks for the MVP. Offers change
            quickly. Always verify on the original source or provider website.
          </p>
        </section>
      </main>
    </div>
  );
}
