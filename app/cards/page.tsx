import type { Metadata } from "next";
import { Suspense } from "react";
import { CardsClient } from "@/components/CardsClient";
import { getCardOffers } from "@/lib/repos";

/**
 * Bank/credit-card offers route — server component. Loads published offers
 * from the repository layer (Supabase when configured, static fallback
 * otherwise — see lib/repos/offers.ts) and passes them to the interactive
 * CardsClient. Owns the route metadata; the client island owns filter state
 * only. RLS restricts the anon read to is_published = true, so nothing here
 * needs to filter drafts itself.
 */

export const metadata: Metadata = {
  title: "Bank & Credit Card Offers | DealStack AU",
  description:
    "Manually verified Australian bank and credit card sign-up bonuses, cashback, statement credits and points offers — compare minimum spend, annual fees and eligibility before you apply.",
};

// ISR: serve cached HTML and refresh from the DB periodically.
export const revalidate = 300;

export default async function CardsPage() {
  const offers = await getCardOffers();
  return (
    <Suspense fallback={<div className="min-h-screen bg-emerald-500/[0.04]" />}>
      <CardsClient offers={offers} />
    </Suspense>
  );
}
