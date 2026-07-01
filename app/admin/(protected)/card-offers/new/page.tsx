import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { CardOfferForm } from "@/components/admin/CardOfferForm";
import { createCardOffer } from "../actions";

export const metadata: Metadata = {
  title: "New card offer | DealStack AU admin",
};

export default async function NewCardOfferPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New card offer</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests.
        </p>
      </header>

      <CardOfferForm action={createCardOffer} submitLabel="Create offer" />
    </div>
  );
}
