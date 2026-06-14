import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/signals";
import { SignalForm } from "@/components/admin/SignalForm";
import { createSignal } from "../actions";

export const metadata: Metadata = {
  title: "New signal | DealStack AU admin",
};

export default async function NewSignalPage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New signal</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no OzBargain fetching, no external source requests.
        </p>
      </header>

      <SignalForm
        action={createSignal}
        stores={stores}
        submitLabel="Create signal"
      />
    </div>
  );
}
