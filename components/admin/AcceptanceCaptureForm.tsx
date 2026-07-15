"use client";

import { useActionState } from "react";
import {
  captureAcceptanceSnapshot,
  type AcceptanceActionState,
} from "@/app/admin/(protected)/gift-cards/acceptance/actions";
import { Button } from "@/components/ui/button";

export default function AcceptanceCaptureForm() {
  const [state, action, pending] = useActionState<AcceptanceActionState, FormData>(
    captureAcceptanceSnapshot,
    {},
  );
  return (
    <form action={action} className="grid gap-3 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">Capture a merchant-list snapshot</h2>
        <p className="text-xs text-muted-foreground">
          Paste captured text or HTML. This action makes no external request and
          stages private candidates only.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-medium">Source id<input name="source_id" required className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Product id<input name="product_id" required className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Evidence URL<input name="evidence_url" type="url" required className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Captured at<input name="captured_at" type="datetime-local" required className="h-9 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-xs font-medium">Content type<select name="content_type" className="h-9 rounded-md border px-2"><option value="text">Plain text</option><option value="html">HTML snapshot</option></select></label>
        <label className="flex items-center gap-2 self-end text-xs font-medium"><input name="complete_snapshot" type="checkbox" />Reviewed as a complete list (allows removal candidates)</label>
      </div>
      <label className="grid gap-1 text-xs font-medium">Captured content<textarea name="content" required rows={8} className="rounded-md border p-2 font-mono text-xs" /></label>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={pending} className="w-fit">{pending ? "Staging…" : "Stage private candidates"}</Button>
    </form>
  );
}

