"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportOfferForm({ offerId }: { offerId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/card-offers/${encodeURIComponent(offerId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: formData.get("reason"),
          details: formData.get("details"),
          website: formData.get("website"),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Could not submit the report.");
        return;
      }
      setMessage("Report received for editorial review. Public content was not changed.");
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-t pt-4">
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
        <Flag />Report incorrect offer
      </Button>
      {open ? (
        <form action={submit} className="mt-3 space-y-3 rounded-md border p-3">
          <label className="grid gap-1 text-xs font-medium">
            What looks wrong?
            <select name="reason" required className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="terms">Terms or qualifying spend</option>
              <option value="fee">Annual fee</option>
              <option value="bonus">Bonus amount or stages</option>
              <option value="expiry">Expiry or availability</option>
              <option value="eligibility">Eligibility</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium">
            Details
            <textarea name="details" required minLength={10} maxLength={2000} rows={4} className="rounded-md border bg-background p-2 text-sm" placeholder="Describe the issuer terms that differ…" />
          </label>
          <label className="hidden" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Submitting…" : "Submit report"}</Button>
        </form>
      ) : null}
      {message ? <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}

