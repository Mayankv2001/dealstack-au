import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "@/components/JsonLd";
import { GiftCardsClient } from "@/components/GiftCardsClient";
import { siteUrl } from "@/lib/env";
import { getCurrentReviewedGiftCardOffers } from "@/lib/repos";
import { buildItemListJsonLd } from "@/lib/structuredData";

/**
 * Public gift-card offers route — server component. Loads published offers from
 * the repository layer (Supabase when configured, static fallback otherwise —
 * see lib/repos/offers.ts) and passes them to the interactive GiftCardsClient.
 * RLS restricts the anon read to is_published = true, so nothing unreviewed can
 * reach this page; the client only holds URL filter state. Mirrors the /cards
 * server/client split.
 */

export const metadata: Metadata = {
  title: "Gift Card Deals | DealStack AU",
  description:
    "Manually reviewed Australian gift-card promotions — discounts, bonus value and points offers — with honest effective-saving valuations and last-checked dates. A core deal-stacking layer.",
};

// ISR: serve cached HTML and refresh from the DB periodically.
export const revalidate = 300;

export default async function GiftCardsPage() {
  // Display boundary: keeps reviewed unknown-expiry offers (labelled "Date
  // unknown", ranked last) — unlike the strict stack-engine read. See
  // lib/giftcards/currentOffers.ts.
  const offers = await getCurrentReviewedGiftCardOffers();
  // ItemList reflects exactly the published, expiry-filtered offers this page
  // renders (cap 20, render order). Navigational only — see structuredData.ts.
  const itemList = buildItemListJsonLd(
    siteUrl(),
    offers.slice(0, 20).map((offer) => ({
      name: offer.brand,
      url: `/gift-cards/${offer.id}`,
    })),
  );
  return (
    <Suspense fallback={<div className="min-h-screen bg-emerald-500/[0.04]" />}>
      {itemList ? <JsonLd data={itemList} /> : null}
      <GiftCardsClient offers={offers} />
    </Suspense>
  );
}
