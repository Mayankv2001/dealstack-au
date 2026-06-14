import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getGiftCardOffer, listStoreOptions } from "@/lib/admin/repos/giftCards";
import { GiftCardForm } from "@/components/admin/GiftCardForm";
import { updateGiftCardOffer } from "../../actions";

export const metadata: Metadata = {
  title: "Edit gift card offer | DealStack AU admin",
};

export default async function EditGiftCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [offer, stores] = await Promise.all([
    getGiftCardOffer(id),
    listStoreOptions(),
  ]);
  if (!offer) notFound();

  // Bind the offer id so the form's action keeps the (state, formData) shape.
  const action = updateGiftCardOffer.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit gift card offer</h1>
        <p className="text-sm text-muted-foreground">
          {offer.brand} · {offer.source}
        </p>
      </header>

      <GiftCardForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          brand: offer.brand,
          discountPercent: offer.discountPercent,
          channel: offer.channel,
          source: offer.source,
          acceptedAtMerchantIds: offer.acceptedAtMerchantIds,
          pointsProgram: offer.pointsOnPurchase?.program ?? "",
          pointsEarnNote: offer.pointsOnPurchase?.earnNote ?? "",
          capDollars: offer.capDollars,
          startDate: offer.startDate,
          expiryDate: offer.expiryDate,
          purchaseLocation: offer.purchaseLocation ?? "",
          purchaseMethod: offer.purchaseMethod ?? "",
          limitPerCustomer: offer.limitPerCustomer ?? "",
          acceptedAt: offer.acceptedAt ?? [],
          usageNotes: offer.usageNotes ?? [],
          stackNotes: offer.stackNotes ?? [],
          sourceDetailUrl: offer.sourceDetailUrl ?? "",
          sourceUrl: offer.citations[0]?.sourceUrl ?? "",
          isPublished: offer.isPublished,
        }}
      />
    </div>
  );
}
