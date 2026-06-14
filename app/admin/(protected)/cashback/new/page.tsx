import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/cashback";
import { CashbackForm } from "@/components/admin/CashbackForm";
import { createCashbackOffer } from "../actions";

export const metadata: Metadata = {
  title: "New cashback offer | DealStack AU admin",
};

export default async function NewCashbackPage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New cashback offer</h1>
        <p className="text-sm text-muted-foreground">
          ShopBack or TopCashback only. Manual entry — no scraping, no external
          source requests.
        </p>
      </header>

      <CashbackForm
        action={createCashbackOffer}
        stores={stores}
        submitLabel="Create offer"
      />
    </div>
  );
}
