"use client";

import { useActionState } from "react";
import {
  capturePredictionSnapshot,
  type PredictionActionState,
} from "@/app/admin/(protected)/gift-cards/predictions/actions";
import { Button } from "@/components/ui/button";

export default function PredictionCaptureForm({ disabled }: { disabled: boolean }) {
  const [state, action, pending] = useActionState<PredictionActionState, FormData>(
    capturePredictionSnapshot,
    {},
  );
  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="font-semibold">Capture a private prediction snapshot</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste or upload captured HTML from the canonical GCDB predictions page. This performs no network request and creates no public offer.
        </p>
      </div>
      <label className="grid gap-1 text-sm font-medium">
        Captured HTML
        <textarea
          name="snapshot_html"
          rows={8}
          maxLength={1_000_000}
          disabled={disabled}
          className="rounded-md border bg-background p-3 font-mono text-xs"
          placeholder="Paste the captured HTML snapshot here"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Or upload HTML
        <input
          name="snapshot_file"
          type="file"
          accept="text/html,text/plain,.html,.htm"
          disabled={disabled}
          className="rounded-md border bg-background p-2 text-sm"
        />
      </label>
      {disabled ? (
        <p role="status" className="text-sm text-amber-700">
          Migration 029 is required before private predictions can be captured.
        </p>
      ) : null}
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p role="status" className="text-sm text-emerald-700">{state.success}</p> : null}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Staging…" : "Stage private predictions"}
      </Button>
    </form>
  );
}
