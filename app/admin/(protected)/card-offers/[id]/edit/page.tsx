import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getCardOffer } from "@/lib/admin/repos/cardOffers";
import { formatDateAU } from "@/lib/sources/normalise";
import { CardOfferForm } from "@/components/admin/CardOfferForm";
import { updateCardOffer } from "../../actions";

export const metadata: Metadata = {
  title: "Edit card offer | DealStack AU admin",
};

export default async function EditCardOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const offer = await getCardOffer(id);
  if (!offer) notFound();

  // Bind the offer id so the form's action keeps the (state, formData) shape.
  const action = updateCardOffer.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit card offer</h1>
        <p className="text-sm text-muted-foreground">
          {offer.provider} · {offer.cardName} · Last checked{" "}
          {formatDateAU(offer.lastCheckedAt) ?? "—"}
        </p>
      </header>

      <CardOfferForm
        action={action}
        submitLabel="Save changes"
        defaultValues={{
          provider: offer.provider,
          cardName: offer.cardName,
          offerType: offer.offerType,
          bonusPoints: offer.bonusPoints,
          cashbackAmount: offer.cashbackAmount,
          statementCreditAmount: offer.statementCreditAmount,
          minimumSpend: offer.minimumSpend,
          minimumSpendPeriod: offer.minimumSpendPeriod,
          annualFee: offer.annualFee,
          eligibilityNotes: offer.eligibilityNotes,
          offerSummary: offer.offerSummary,
          sourceUrl: offer.sourceUrl,
          confidence: offer.confidence,
          expiryDate: offer.expiryDate,
          isPublished: offer.isPublished,
        }}
      />
    </div>
  );
}
