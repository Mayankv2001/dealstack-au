import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Logo from "@/components/Logo";
import SearchBar from "@/components/SearchBar";
import StoreCard from "@/components/StoreCard";
import { getStores } from "@/lib/repos";
import type { Store } from "@/lib/data";

export const metadata: Metadata = {
  title: "All stores — DealStack AU",
  description:
    "Every retailer DealStack tracks for stackable savings — cashback, gift cards, points and codes.",
};

// ISR: serve cached HTML and refresh stores from the DB periodically, matching
// the home, search and /deals routes. getStores() falls back to static data when
// Supabase is unconfigured or unavailable, so the page always renders.
export const revalidate = 300;

function groupByCategory(stores: Store[]): Map<string, Store[]> {
  const groups = new Map<string, Store[]>();
  for (const store of stores) {
    const existing = groups.get(store.category);
    if (existing) {
      existing.push(store);
    } else {
      groups.set(store.category, [store]);
    }
  }
  return groups;
}

export default async function StoresIndexPage() {
  const stores = await getStores();
  const groups = groupByCategory(stores);

  return (
    <div className="min-h-screen bg-emerald-500/[0.04]">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/deals">Deals</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/cards">Cards</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/resources">Resources</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="hidden bg-background sm:inline-flex"
            >
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          All stores
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {`${stores.length} ${stores.length === 1 ? "store" : "stores"} with stackable savings`}
        </p>

        <SearchBar defaultValue="" className="mt-3 max-w-md" />

        {stores.length === 0 ? (
          <Card className="mt-5 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="font-medium">No stores available right now</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Check back shortly — our store list refreshes automatically.
              </p>
            </CardContent>
          </Card>
        ) : (
          Array.from(groups.entries()).map(([category, categoryStores]) => (
            <section key={category} className="mt-8 first:mt-5">
              <h2 className="text-lg font-bold tracking-tight sm:text-xl">
                {category}
              </h2>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {categoryStores.map((store) => (
                  <StoreCard key={store.id} store={store} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
