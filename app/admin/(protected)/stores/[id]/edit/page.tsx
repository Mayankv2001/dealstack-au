import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getStore } from "@/lib/admin/repos/stores";
import { StoreForm } from "@/components/admin/StoreForm";
import { updateStore } from "../../actions";

export const metadata: Metadata = {
  title: "Edit store | DealStack AU admin",
};

export default async function EditStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const store = await getStore(id);
  if (!store) notFound();

  // Bind the store id so the form's action keeps the (state, formData) shape.
  // The id is passed here (route param) — never read from the form — so it is
  // immutable no matter what the browser submits.
  const action = updateStore.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Edit store</h1>
        <p className="text-sm text-muted-foreground">
          {store.name} · {store.id}
          {store.isPublished ? "" : " · Unpublished"}
        </p>
      </header>

      <StoreForm
        mode="edit"
        action={action}
        submitLabel="Save changes"
        defaultValues={{
          id: store.id,
          name: store.name,
          category: store.category,
          logo: store.logo,
          logoPath: store.logoPath,
          logoText: store.logoText,
          logoSubtext: store.logoSubtext,
          // jsonb → pretty JSON string for the textarea; null/empty → blank.
          logoTheme: store.logoTheme
            ? JSON.stringify(store.logoTheme, null, 2)
            : "",
          discountPercent: store.discountPercent,
          discountCode: store.discountCode,
          expiryDate: store.expiryDate,
          cashbackPercent: store.cashbackPercent,
          cashbackProvider: store.cashbackProvider,
          giftCardDiscountPercent: store.giftCardDiscountPercent,
          giftCardSource: store.giftCardSource,
          pointsProgram: store.pointsProgram,
          pointsRate: store.pointsRate,
          aliases: store.aliases,
          isPublished: store.isPublished,
          sortOrder: store.sortOrder,
        }}
      />
    </div>
  );
}
