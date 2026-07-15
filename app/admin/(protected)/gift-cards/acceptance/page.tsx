import type { Metadata } from "next";
import AcceptanceCaptureForm from "@/components/admin/AcceptanceCaptureForm";
import { AdminListTable } from "@/components/admin/AdminListTable";
import { requireAdmin } from "@/lib/admin/auth";
import {
  isAcceptanceCandidateSchemaAvailable,
  listAcceptanceCandidates,
} from "@/lib/admin/repos/giftCardAcceptance";
import {
  bulkApproveAcceptanceCandidates,
} from "./actions";

const ACCEPTANCE_BULK_MAX = 200;

export const metadata: Metadata = { title: "Acceptance review | DealStack AU admin" };
export const dynamic = "force-dynamic";

export default async function AcceptanceQueuePage() {
  await requireAdmin();
  const schemaAvailable = await isAcceptanceCandidateSchemaAvailable();
  const candidates = schemaAvailable ? await listAcceptanceCandidates() : [];
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Gift-card acceptance review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alias resolution and source parsing only stage private candidates.
          Publication requires an explicit reviewed RPC approval.
        </p>
      </header>
      {!schemaAvailable ? (
        <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          Migration 028 is not available. No acceptance queue or capture writes are enabled.
        </div>
      ) : (
        <>
          <AcceptanceCaptureForm />
          <AdminListTable
            columns={[
              { key: "merchant", header: "Merchant" },
              { key: "product", header: "Product" },
              { key: "resolution", header: "Resolution" },
              { key: "change", header: "Change" },
              { key: "evidence", header: "Evidence" },
            ]}
            rows={candidates.map((candidate) => ({
              id: candidate.id,
              searchText: `${candidate.rawMerchantName} ${candidate.proposedProductId ?? ""} ${candidate.resolvedStoreId ?? ""}`.toLowerCase(),
              filterValue: candidate.resolutionState,
              selectable: candidate.resolutionState === "resolved",
              editHref: `/admin/gift-cards/acceptance/${candidate.id}`,
              cells: {
                merchant: { kind: "text", text: candidate.rawMerchantName, strong: true },
                product: { kind: "text", text: candidate.proposedProductId ?? "Missing", mono: true },
                resolution: { kind: "badge", text: candidate.resolutionState, tone: candidate.resolutionState === "resolved" ? "emerald" : "amber" },
                change: { kind: "badge", text: candidate.changeKind, tone: candidate.changeKind === "removed" ? "destructive" : "secondary" },
                evidence: { kind: "text", text: String(candidate.proposedValues.evidence_source_type ?? "Missing"), muted: true },
              },
            }))}
            filter={{ label: "Resolution", options: [
              { value: "resolved", label: "Resolved" },
              { value: "unresolved", label: "Unresolved" },
              { value: "ambiguous", label: "Ambiguous" },
            ] }}
            bulk={{ run: bulkApproveAcceptanceCandidates, label: "Approve selected", confirmBody: "Approve these reviewed acceptance candidates?", max: ACCEPTANCE_BULK_MAX }}
          />
        </>
      )}
    </div>
  );
}
