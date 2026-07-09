import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { StoreForm } from "@/components/admin/StoreForm";
import { createStore } from "../actions";

export const metadata: Metadata = {
  title: "New store | DealStack AU admin",
};

export default async function NewStorePage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">New store</h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests. Pick the id
          carefully: it is the permanent public URL and how offers link here.
        </p>
      </header>

      <StoreForm mode="create" action={createStore} submitLabel="Create store" />
    </div>
  );
}
