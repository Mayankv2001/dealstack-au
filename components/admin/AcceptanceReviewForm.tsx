"use client";

import { useActionState } from "react";
import {
  reviewAcceptanceCandidate,
  type AcceptanceActionState,
} from "@/app/admin/(protected)/gift-cards/acceptance/actions";
import { Button } from "@/components/ui/button";
import type { AcceptanceCandidateRow } from "@/lib/admin/repos/giftCardAcceptance";

export default function AcceptanceReviewForm({
  candidate,
  stores,
}: {
  candidate: AcceptanceCandidateRow;
  stores: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState<AcceptanceActionState, FormData>(
    reviewAcceptanceCandidate.bind(null, candidate.id),
    {},
  );
  const value = (key: string) => String(candidate.proposedValues[key] ?? "");
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium">Merchant name<input name="merchant_name" defaultValue={value("merchant_name") || candidate.rawMerchantName} className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Canonical store<select name="store_id" defaultValue={candidate.resolvedStoreId ?? ""} className="h-9 rounded-md border px-2"><option value="">Unresolved</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name} ({store.id})</option>)}</select></label>
        <label className="grid gap-1 text-xs font-medium">Acceptance status<select name="acceptance_status" defaultValue={value("acceptance_status") || "requires-verification"} className="h-9 rounded-md border px-2"><option value="confirmed-accepted">Confirmed accepted</option><option value="confirmed-not-accepted">Confirmed not accepted</option><option value="likely-accepted">Likely accepted</option><option value="unofficially-reported">Unofficially reported</option><option value="requires-verification">Requires verification</option></select></label>
        <label className="grid gap-1 text-xs font-medium">Valid until<input name="valid_until" type="date" defaultValue={value("valid_until")} className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Existing acceptance id<input name="linked_acceptance_id" defaultValue={candidate.linkedAcceptanceId ?? ""} className="h-9 rounded-md border px-2 font-mono text-xs" /></label>
        <label className="grid gap-1 text-xs font-medium">Split merchant names<textarea name="split_names" rows={2} placeholder="One merchant per line" className="rounded-md border p-2" /></label>
      </div>
      <dl className="grid gap-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2">
        <div><dt className="font-semibold">Evidence tier</dt><dd>{value("evidence_source_type") || "Missing"}</dd></div>
        <div><dt className="font-semibold">Evidence URL</dt><dd className="break-all">{value("evidence_url") || "Missing"}</dd></div>
        <div><dt className="font-semibold">Captured</dt><dd>{value("evidence_captured_at") || "Missing"}</dd></div>
        <div><dt className="font-semibold">Channels</dt><dd>Online {value("accepts_online") || "unknown"} · in store {value("accepts_in_store") || "unknown"}</dd></div>
        <div className="sm:col-span-2"><dt className="font-semibold">Limitations</dt><dd>{value("limitations") || "Not recorded"}</dd></div>
      </dl>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button name="intent" value="approve" disabled={pending || candidate.resolutionState !== "resolved"}>Approve via reviewed RPC</Button>
        <Button name="intent" value="save-match" variant="outline" disabled={pending}>Correct merchant match</Button>
        <Button name="intent" value="create-alias" variant="outline" disabled={pending}>Create reviewed alias</Button>
        <Button name="intent" value="mark-unofficial" variant="outline" disabled={pending}>Mark unofficial</Button>
        <Button name="intent" value="mark-removed" variant="outline" disabled={pending}>Mark no longer accepted</Button>
        <Button name="intent" value="merge-duplicate" variant="outline" disabled={pending}>Merge duplicate relationship</Button>
        <Button name="intent" value="split" variant="outline" disabled={pending}>Split relationship</Button>
        <Button name="intent" value="request-recheck" variant="outline" disabled={pending}>Request recheck</Button>
        <Button name="intent" value="reject" variant="destructive" disabled={pending}>Reject</Button>
      </div>
    </form>
  );
}

