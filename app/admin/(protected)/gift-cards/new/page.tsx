import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/giftCards";
import { GiftCardForm } from "@/components/admin/GiftCardForm";
import { createGiftCardOffer } from "../actions";

export const metadata: Metadata = {
  title: "New gift card offer | DealStack AU admin",
};

export default async function NewGiftCardPage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New gift card offer</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests.
        </p>
      </header>

      <GiftCardForm
        action={createGiftCardOffer}
        stores={stores}
        submitLabel="Create offer"
      />
    </div>
  );
}
