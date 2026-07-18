import HomeClient from "@/components/HomeClient";
import { getStores } from "@/lib/repos";

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
  const stores = await getStores();
  return <HomeClient stores={stores} />;
}
