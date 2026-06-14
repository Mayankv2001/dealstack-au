import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getPointsOffer, listStoreOptions } from "@/lib/admin/repos/points";
import { PointsForm } from "@/components/admin/PointsForm";
import { updatePointsOffer } from "../../actions";

export const metadata: Metadata = {
  title: "Edit points offer | DealStack AU admin",
};

export default async function EditPointsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [offer, stores] = await Promise.all([
    getPointsOffer(id),
    listStoreOptions(),
  ]);
  if (!offer) notFound();

  // Bind the offer id so the form's action keeps the (state, formData) shape.
  const action = updatePointsOffer.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit points offer</h1>
        <p className="text-sm text-muted-foreground">
          {offer.program} · {offer.storeName ?? "Program-wide"}
        </p>
      </header>

      <PointsForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          merchantId: offer.merchantId,
          program: offer.program,
          earnRateDisplay: offer.earnRateDisplay,
          earnMultiple: offer.earnMultiple,
          pointValueCents: offer.pointValueCents,
          mechanism: offer.mechanism,
          expiryDate: offer.expiryDate,
          sourceUrl: offer.citations[0]?.sourceUrl ?? "",
          confidence: offer.confidence,
          isPublished: offer.isPublished,
        }}
      />
    </div>
  );
}
