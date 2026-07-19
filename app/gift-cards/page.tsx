import type { Metadata } from "next";
import { Suspense } from "react";
import { GiftCardsClient } from "@/components/GiftCardsClient";
import { getCurrentReviewedGiftCardOffers } from "@/lib/repos";

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
  return (
    <Suspense fallback={<div className="min-h-screen bg-emerald-500/[0.04]" />}>
      <GiftCardsClient offers={offers} />
    </Suspense>
  );
}
