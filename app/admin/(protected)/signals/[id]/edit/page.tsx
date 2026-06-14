import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getSignal, listStoreOptions } from "@/lib/admin/repos/signals";
import { SignalForm } from "@/components/admin/SignalForm";
import { updateSignal } from "../../actions";

export const metadata: Metadata = {
  title: "Edit signal | DealStack AU admin",
};

export default async function EditSignalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const [signal, stores] = await Promise.all([
    getSignal(id),
    listStoreOptions(),
  ]);
  if (!signal) notFound();

  // Bind the signal id so the form's action keeps the (state, formData) shape.
  const action = updateSignal.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit signal</h1>
        <p className="text-sm text-muted-foreground">
          {signal.title} · {signal.storeName ?? "No store"}
        </p>
      </header>

      <SignalForm
        action={action}
        stores={stores}
        submitLabel="Save changes"
        defaultValues={{
          merchantId: signal.merchantId,
          title: signal.title,
          summary: signal.summary,
          votesSample: signal.votesSample,
          commentCount: signal.commentCount ?? null,
          sentiment: signal.sentiment,
          dealKind: signal.dealKind,
          sourceUrl: signal.sourceUrl,
          merchantUrl: signal.merchantUrl ?? "",
          productUrl: signal.productUrl ?? "",
          postedAt: signal.postedAt,
          expiryDate: signal.expiryDate ?? "",
          tags: signal.tags ?? [],
          promoCode: signal.promoCode ?? "",
          priceText: signal.priceText ?? "",
          signalScore: signal.signalScore ?? null,
          confidence: signal.confidence,
          isSample: signal.isSample,
          status: signal.status,
        }}
      />
    </div>
  );
}
