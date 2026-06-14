import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getWeeklyDeal, listStoreOptions } from "@/lib/admin/repos/weeklyDeals";
import { WeeklyDealForm } from "@/components/admin/WeeklyDealForm";
import { updateWeeklyDeal } from "../../actions";

export const metadata: Metadata = {
  title: "Edit weekly deal | DealStack AU admin",
};

export default async function EditWeeklyDealPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [deal, stores] = await Promise.all([
    getWeeklyDeal(id),
    listStoreOptions(),
  ]);
  if (!deal) notFound();

  // Bind the deal id so the form's action keeps the (state, formData) shape.
  const action = updateWeeklyDeal.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit weekly deal</h1>
        <p className="text-sm text-muted-foreground">
          {deal.title} · week of {deal.weekOf}
        </p>
      </header>

      <WeeklyDealForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          weekOf: deal.weekOf,
          merchantId: deal.merchantId,
          title: deal.title,
          summary: deal.summary,
          highlight: deal.highlight,
          componentIds: deal.componentIds,
          expiryDate: deal.expiryDate ?? "",
          confidence: deal.confidence,
          sourceUrl: deal.citations[0]?.sourceUrl ?? "",
          isPublished: deal.isPublished,
        }}
      />
    </div>
  );
}
