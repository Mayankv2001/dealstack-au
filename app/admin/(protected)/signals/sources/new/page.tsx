import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listStoreOptions } from "@/lib/admin/repos/feedSources";
import { FeedSourceForm } from "@/components/admin/FeedSourceForm";
import { createFeedSource } from "../actions";

export const metadata: Metadata = {
  title: "New feed source | DealStack AU admin",
};

export default async function NewFeedSourcePage() {
  await requireAdmin();
  const stores = await listStoreOptions();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New feed source</h1>
        <p className="text-sm text-muted-foreground">
          Registration only — no fetching happens. New feeds default to disabled.
        </p>
      </header>

      <FeedSourceForm
        action={createFeedSource}
        stores={stores}
        submitLabel="Create feed source"
      />
    </div>
  );
}
