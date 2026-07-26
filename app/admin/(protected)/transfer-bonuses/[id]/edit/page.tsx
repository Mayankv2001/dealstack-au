import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getTransferBonus } from "@/lib/admin/repos/transferBonuses";
import { TransferBonusForm } from "@/components/admin/TransferBonusForm";
import { REWARDS_PROGRAMMES } from "@/lib/rewards/programmes";
import { bonusPercentLabel } from "@/lib/rewards/transferBonus";
import { updateTransferBonus } from "../../actions";

export const metadata: Metadata = {
  title: "Edit transfer bonus | DealStack AU admin",
};

const programmeName = (slug: string): string =>
  REWARDS_PROGRAMMES.find((programme) => programme.slug === slug)?.shortName ??
  slug;

export default async function EditTransferBonusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const bonus = await getTransferBonus(id);
  if (!bonus) notFound();

  // Bind the id so the form's action keeps the (state, formData) shape.
  const action = updateTransferBonus.bind(null, id);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Edit transfer bonus
        </h1>
        <p className="text-sm text-muted-foreground">
          {programmeName(bonus.fromProgramme)} →{" "}
          {programmeName(bonus.toProgramme)} · {bonusPercentLabel(bonus)}
        </p>
      </header>

      <TransferBonusForm
        action={action}
        submitLabel="Save changes"
        defaultValues={{
          fromProgramme: bonus.fromProgramme,
          toProgramme: bonus.toProgramme,
          bonusPercentMin: bonus.bonusPercentMin,
          bonusPercentMax: bonus.bonusPercentMax,
          startsOn: bonus.startsOn,
          expiryDate: bonus.expiryDate,
          conditionsNote: bonus.conditionsNote,
          sourceUrl: bonus.citations[0]?.sourceUrl ?? "",
          sourceId: bonus.citations[0]?.source ?? "freepoints",
          confidence: bonus.confidence,
        }}
      />
    </div>
  );
}
