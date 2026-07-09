import type { Metadata } from "next";
import HomeClient from "@/components/HomeClient";
import { JsonLd } from "@/components/JsonLd";
import { siteUrl } from "@/lib/env";
import { getStores } from "@/lib/repos";
import { getTopDeals } from "@/lib/repos/topDeals";
import {
  buildOrganizationJsonLd,
  buildWebSiteJsonLd,
} from "@/lib/structuredData";

export const metadata: Metadata = {
  title: "DealStack AU — Stack cashback, gift cards & points at Australian stores",
  description:
    "See the best way to stack discount codes, cashback, discounted gift cards and points at popular Australian retailers — plus admin-reviewed OzBargain deal signals.",
};

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
  // Site-level JSON-LD alongside (not inside) the client island — server
  // components render script tags fine, and this keeps HomeClient untouched.
  const site = siteUrl();
  return (
    <>
      <JsonLd data={buildWebSiteJsonLd(site)} />
      <JsonLd data={buildOrganizationJsonLd(site)} />
      <HomeClient stores={stores} topDeals={topDeals} />
    </>
  );
}
