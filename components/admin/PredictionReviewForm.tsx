"use client";

import { useActionState } from "react";
import { recordPredictionReview, type PredictionActionState } from "@/app/admin/(protected)/gift-cards/predictions/actions";
import { Button } from "@/components/ui/button";
import type { AdminPredictionRow } from "@/lib/admin/repos/giftCardPredictions";

export default function PredictionReviewForm({ prediction }: { prediction: AdminPredictionRow }) {
  const [state, action, pending] = useActionState<PredictionActionState, FormData>(
    recordPredictionReview.bind(null, prediction.id),
    {},
  );
  return (
    <form action={action} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-3">
      <label className="grid gap-1 text-xs font-medium">Outcome<select name="status" defaultValue={prediction.status.startsWith("prediction_") ? prediction.status : "prediction_partially_matched"} className="h-9 rounded-md border px-2"><option value="prediction_matched">Matched</option><option value="prediction_partially_matched">Partially matched</option><option value="prediction_missed">Missed</option></select></label>
      <label className="grid gap-1 text-xs font-medium">Confirmed offer id<input name="linked_offer_id" defaultValue={prediction.linkedOfferId ?? ""} className="h-9 rounded-md border px-2" /></label>
      <label className="grid gap-1 text-xs font-medium">Comparison note<textarea name="comparison_notes" defaultValue={prediction.comparisonNotes ?? ""} rows={2} className="rounded-md border p-2" /></label>
      {state.error ? <p role="alert" className="text-xs text-destructive sm:col-span-3">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-xs text-emerald-700 sm:col-span-3">{state.success}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit sm:col-span-3">{pending ? "Recording…" : "Record outcome"}</Button>
    </form>
  );
}

