import type { Metadata } from "next";
import DealsClient from "@/components/DealsClient";

/**
 * Weekly Deals route — a thin server component so it can own the page
 * metadata. All interactivity (filter pills + client-side filtering) lives in
 * components/DealsClient.tsx. Static/manual data only; no network, no database.
 */

export const metadata: Metadata = {
  title: "Weekly Deals | DealStack AU",
  description:
    "Weekly deal stacks, gift card offers, points boosts, cashback boosts and deal signals for Australian shoppers.",
};

export default function DealsPage() {
  return <DealsClient />;
}
