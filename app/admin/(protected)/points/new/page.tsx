import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/points";
import { PointsForm } from "@/components/admin/PointsForm";
import { createPointsOffer } from "../actions";

export const metadata: Metadata = {
  title: "New points offer | DealStack AU admin",
};

export default async function NewPointsPage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New points offer</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests.
        </p>
      </header>

      <PointsForm
        action={createPointsOffer}
        stores={stores}
        submitLabel="Create offer"
      />
    </div>
  );
}
