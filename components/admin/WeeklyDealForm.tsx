"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable weekly-deal create/edit composer (client island).
 *
 * It is intentionally decoupled from the service-role admin repo: the parent
 * server page passes in a server `action` and the plain `stores` list, so none
 * of the privileged data layer is bundled into the browser. The highlight and
 * confidence option lists are duplicated here as plain constants for the same
 * reason. Validation lives in the server action; this only collects input and
 * surfaces the returned error.
 */

const HIGHLIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: "best-stack", label: "Best stack" },
  { value: "gift-card", label: "Gift card" },
  { value: "points", label: "Points" },
  { value: "cashback", label: "Cashback" },
  { value: "signal", label: "Signal" },
  { value: "needs-verification", label: "Needs verification" },
];

const CONFIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "needs-verification", label: "Needs verification" },
  { value: "expired-unknown", label: "Expired / unknown" },
];

export interface StoreOption {
  id: string;
  name: string;
}

export interface WeeklyDealFormDefaults {
  weekOf?: string;
  merchantId?: string | null;
  title?: string;
  summary?: string;
  highlight?: string;
  componentIds?: string[];
  expiryDate?: string | null;
  confidence?: string;
  sourceUrl?: string;
  isPublished?: boolean;
}

export type WeeklyDealFormState = { error?: string };

interface WeeklyDealFormProps {
  action: (
    state: WeeklyDealFormState,
    formData: FormData
  ) => Promise<WeeklyDealFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: WeeklyDealFormDefaults;
}

// Mirrors components/ui/input.tsx so native <select>/<textarea> look consistent.
const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function WeeklyDealForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: WeeklyDealFormProps) {
  const [state, formAction, isPending] = useActionState<
    WeeklyDealFormState,
    FormData
  >(action, {});

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {state?.error ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="Title"
        htmlFor="title"
        hint="Headline for this week's curated card."
      >
        <Input
          id="title"
          name="title"
          required
          defaultValue={defaultValues?.title ?? ""}
        />
      </Field>

      <Field
        label="Summary"
        htmlFor="summary"
        hint="Short paraphrase in our own words (≈200 chars max)."
      >
        <textarea
          id="summary"
          name="summary"
          rows={3}
          defaultValue={defaultValues?.summary ?? ""}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Week of"
          htmlFor="week_of"
          hint="Set to the current week's Monday. The DQ report flags this as stale once the week ends."
        >
          <Input
            id="week_of"
            name="week_of"
            type="date"
            required
            defaultValue={defaultValues?.weekOf ?? ""}
          />
        </Field>

        <Field
          label="Store"
          htmlFor="merchant_id"
          hint="Optional — leave blank for a non-merchant deal."
        >
          <select
            id="merchant_id"
            name="merchant_id"
            defaultValue={defaultValues?.merchantId ?? ""}
            className={controlClass}
          >
            <option value="">No store</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Highlight" htmlFor="highlight">
          <select
            id="highlight"
            name="highlight"
            required
            defaultValue={defaultValues?.highlight ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a highlight…
            </option>
            {HIGHLIGHT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Confidence" htmlFor="confidence">
          <select
            id="confidence"
            name="confidence"
            required
            defaultValue={defaultValues?.confidence ?? "needs-verification"}
            className={controlClass}
          >
            {CONFIDENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Expiry date"
          htmlFor="expiry_date"
          hint="Optional. When set, the DQ report flags this deal as expired once the date passes."
        >
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            defaultValue={defaultValues?.expiryDate ?? ""}
          />
        </Field>

        <Field
          label="Source URL"
          htmlFor="source_url"
          hint="Citation link backing this deal. Needed to pass the data-quality source check."
        >
          <Input
            id="source_url"
            name="source_url"
            type="url"
            placeholder="https://…"
            defaultValue={defaultValues?.sourceUrl ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Component IDs"
        htmlFor="component_ids"
        hint="One offer id per line (e.g. gc-…, cb-…, pts-…, sig-…) that this deal references."
      >
        <textarea
          id="component_ids"
          name="component_ids"
          rows={4}
          defaultValue={(defaultValues?.componentIds ?? []).join("\n")}
          className={cn(controlClass, "min-h-24 font-mono")}
        />
      </Field>

      <fieldset className="space-y-3">
        <label htmlFor="is_published" className="flex items-start gap-2.5 text-sm">
          <input
            id="is_published"
            name="is_published"
            type="checkbox"
            defaultChecked={defaultValues?.isPublished ?? true}
            className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
          />
          <span>
            <span className="font-medium">Published</span>
            <span className="block text-xs text-muted-foreground">
              Visible on /deals. Uncheck to keep it as a draft.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="space-y-1 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Update Week of each week</span>{" "}
          — the DQ report flags this card as stale once the week ends.
        </p>
        <p>Admin edits take effect on the live site immediately; seed scripts are for demo reset only.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/weekly-deals">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default WeeklyDealForm;
