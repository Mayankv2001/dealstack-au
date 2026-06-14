import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getCashbackOffer, listStoreOptions } from "@/lib/admin/repos/cashback";
import { CashbackForm } from "@/components/admin/CashbackForm";
import { updateCashbackOffer } from "../../actions";

export const metadata: Metadata = {
  title: "Edit cashback offer | DealStack AU admin",
};

export default async function EditCashbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [offer, stores] = await Promise.all([
    getCashbackOffer(id),
    listStoreOptions(),
  ]);
  if (!offer) notFound();

  // Bind the offer id so the form's action keeps the (state, formData) shape.
  const action = updateCashbackOffer.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit cashback offer</h1>
        <p className="text-sm text-muted-foreground">
          {offer.storeName ?? offer.merchantId} · {offer.provider}
        </p>
      </header>

      <CashbackForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          merchantId: offer.merchantId,
          provider: offer.provider,
          ratePercent: offer.ratePercent,
          flatAmount: offer.flatAmount,
          capDollars: offer.capDollars,
          isUpsized: offer.isUpsized,
          excludesGiftCardPayment: offer.excludesGiftCardPayment,
          termsSummary: offer.termsSummary,
          expiryDate: offer.expiryDate,
          confidence: offer.confidence,
          sourceUrl: offer.citations[0]?.sourceUrl ?? "",
          isPublished: offer.isPublished,
        }}
      />
    </div>
  );
}
