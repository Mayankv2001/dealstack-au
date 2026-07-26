import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { TransferBonusForm } from "@/components/admin/TransferBonusForm";
import { createTransferBonus } from "../actions";

export const metadata: Metadata = {
  title: "New transfer bonus | DealStack AU admin",
};

export default async function NewTransferBonusPage() {
  await requireAdmin();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          New transfer bonus
        </h1>
        <p className="text-sm text-muted-foreground">
          Manual entry — no scraping, no external source requests. Created as a
          draft.
        </p>
      </header>

      <TransferBonusForm
        action={createTransferBonus}
        submitLabel="Create bonus"
      />
    </div>
  );
}
