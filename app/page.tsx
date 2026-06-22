import HomeClient from "@/components/HomeClient";
import { getStores } from "@/lib/repos";
import { getTopDeals } from "@/lib/repos/topDeals";

/**
 * Homepage — server component. Loads stores from the repository layer (Supabase
 * when configured, static fallback otherwise) and hands them to the interactive
 * HomeClient island. getStores() itself swallows DB failures and missing env and
 * returns the static `stores` array, so the page always renders.
 */

// ISR: serve cached HTML and refresh stores from the DB periodically, matching
// the /deals route's cadence.
export const revalidate = 300;

export default async function Home() {
  // Both reads fall back gracefully (stores → static; top deals → []), so the
  // homepage always renders even without Supabase configured.
  const [stores, topDeals] = await Promise.all([getStores(), getTopDeals()]);
  return <HomeClient stores={stores} topDeals={topDeals} />;
}
