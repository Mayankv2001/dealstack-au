import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, SearchX, Store as StoreIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SearchBar from "@/components/SearchBar";
import StoreCard from "@/components/StoreCard";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import type { Store } from "@/lib/data";
import { buildStackRecommendations } from "@/lib/stack/buildStack";
import { loadStackData } from "@/lib/stack/loadStack";

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
  // Same engine + data bundle as the homepage and store pages, so the
  // "estimated saving" on these cards can never disagree with them.
  const data = await loadStackData();
  const stores = data.stores;
  const recommendations = buildStackRecommendations(undefined, 500, data);
  const recommendationByStore = new Map(
    recommendations.map((rec) => [rec.merchantId, rec])
  );
  const groups = groupByCategory(stores);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="page-container flex-1 py-8 sm:py-12">
        <section className="soft-panel p-5 sm:p-7">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <p className="eyebrow inline-flex items-center gap-2"><StoreIcon aria-hidden className="size-4" /> Store planner</p>
              <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] sm:text-4xl">
                Start with where you’re shopping
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Open a store to see one compatible purchase plan—not a pile of disconnected rates. Checkout savings, later cashback and points stay clearly separated.
              </p>
              <p className="mt-4 text-xs font-semibold text-muted-foreground">
                {`${stores.length} reviewed ${stores.length === 1 ? "store" : "stores"}`}
              </p>
            </div>
            <div>
              <SearchBar
                defaultValue=""
                className="max-w-xl"
                placeholder="Search a store, product or programme"
                buttonLabel="Plan"
              />
              <Link href="/deals?view=stacks" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline">
                Compare the best current stacks <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        {stores.length === 0 ? (
          <Card className="mt-5 shadow-sm">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <SearchX className="size-8 text-muted-foreground" />
              <p className="font-medium">No stores available right now</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Published stores are temporarily unavailable. Browse current
                deals or try again after the data source recovers.
              </p>
              <Button asChild variant="outline" size="sm"><Link href="/deals">Browse deals</Link></Button>
            </CardContent>
          </Card>
        ) : (
          Array.from(groups.entries()).map(([category, categoryStores]) => (
            <section key={category} className="mt-10 first:mt-8">
              <h2 className="text-xl font-black tracking-tight sm:text-2xl">
                {category}
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {categoryStores.map((store) => (
                  <StoreCard
                    key={store.id}
                    store={store}
                    recommendation={recommendationByStore.get(store.id) ?? null}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
