import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/weeklyDeals";
import { WeeklyDealForm } from "@/components/admin/WeeklyDealForm";
import { createWeeklyDeal } from "../actions";

export const metadata: Metadata = {
  title: "New weekly deal | DealStack AU admin",
};

export default async function NewWeeklyDealPage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New weekly deal</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests.
        </p>
      </header>

      <WeeklyDealForm
        action={createWeeklyDeal}
        stores={stores}
        submitLabel="Create weekly deal"
      />
    </div>
  );
}
