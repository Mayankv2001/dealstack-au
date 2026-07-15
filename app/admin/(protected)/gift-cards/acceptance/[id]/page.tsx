import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AcceptanceReviewForm from "@/components/admin/AcceptanceReviewForm";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAcceptanceCandidate,
  validateReviewedAcceptance,
} from "@/lib/admin/repos/giftCardAcceptance";
import { listStores } from "@/lib/admin/repos/stores";
import { getGiftCardAcceptance } from "@/lib/repos";

export const metadata: Metadata = { title: "Review acceptance | DealStack AU admin" };
export const dynamic = "force-dynamic";

export default async function AcceptanceCandidatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const candidate = await getAcceptanceCandidate(id);
  if (!candidate) notFound();
  const [stores, productAcceptance] = await Promise.all([
    listStores(),
    candidate.proposedProductId
      ? getGiftCardAcceptance([candidate.proposedProductId])
      : Promise.resolve([]),
  ]);
  const previous = candidate.linkedAcceptanceId
    ? productAcceptance.find((row) => row.id === candidate.linkedAcceptanceId) ?? null
    : null;
  const proposed = candidate.proposedValues;
  const validationWarnings = validateReviewedAcceptance({
    ...proposed,
    product_id: candidate.proposedProductId,
    store_id: candidate.resolvedStoreId,
  });
  const diffRows = previous
    ? [
        ["merchant", previous.merchantName, proposed.merchant_name],
        ["store", previous.storeId, candidate.resolvedStoreId],
        ["status", previous.acceptanceStatus, proposed.acceptance_status],
        ["online", previous.acceptsOnline, proposed.accepts_online],
        ["in store", previous.acceptsInStore, proposed.accepts_in_store],
        ["app", previous.acceptsApp, proposed.accepts_app],
        ["phone", previous.acceptsPhone, proposed.accepts_phone],
        ["MCC", previous.mcc, proposed.mcc],
        ["limitations", previous.limitations, proposed.limitations],
        ["evidence tier", previous.evidenceSourceType, proposed.evidence_source_type],
        ["evidence URL", previous.evidenceUrl, proposed.evidence_url],
      ]
    : [];
  return (
    <div className="space-y-6">
      <header>
        <Link href="/admin/gift-cards/acceptance" className="text-sm text-muted-foreground hover:underline">← Acceptance queue</Link>
        <h1 className="mt-2 text-2xl font-semibold">{candidate.rawMerchantName}</h1>
        <p className="text-sm text-muted-foreground">{candidate.changeKind} · {candidate.resolutionState} · candidate {candidate.id}</p>
      </header>
      {validationWarnings.length ? (
        <ul className="list-disc rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 pl-8 text-sm text-amber-900 dark:text-amber-200">
          {validationWarnings.map((warning) => <li key={warning}>{warning}</li>)}
        </ul>
      ) : null}
      {previous ? (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[36rem] text-left text-xs">
            <thead className="bg-muted/50"><tr><th className="p-2">Field</th><th className="p-2">Published relationship</th><th className="p-2">Candidate</th></tr></thead>
            <tbody>
              {diffRows.map(([field, before, after]) => (
                <tr key={String(field)} className={String(before ?? "") !== String(after ?? "") ? "border-t bg-amber-500/[0.06]" : "border-t"}>
                  <th className="p-2 font-medium">{String(field)}</th>
                  <td className="p-2 text-muted-foreground">{String(before ?? "Not recorded")}</td>
                  <td className="p-2">{String(after ?? "Not recorded")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          New relationship — there is no previous approved acceptance row to compare.
        </p>
      )}
      <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">{JSON.stringify(candidate.proposedValues, null, 2)}</pre>
      <AcceptanceReviewForm candidate={candidate} stores={stores.map(({ id: storeId, name }) => ({ id: storeId, name }))} />
    </div>
  );
}
