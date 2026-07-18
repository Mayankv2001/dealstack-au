"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable points create/edit form (client island).
 *
 * It is intentionally decoupled from the service-role admin repo: the parent
 * server page passes in a server `action` and the plain `stores` list, so none
 * of the privileged data layer is bundled into the browser. Mechanism and
 * confidence option lists are duplicated here as plain constants for the same
 * reason. Validation lives in the server action; this only collects input and
 * surfaces the returned error.
 */

const MECHANISM_OPTIONS: { value: string; label: string }[] = [
  { value: "in-store-boost", label: "In-store boost" },
  { value: "card-linked", label: "Card-linked" },
  { value: "shopping-portal", label: "Shopping portal" },
  { value: "base-earn", label: "Base earn" },
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

export interface PointsFormDefaults {
  merchantId?: string | null;
  program?: string;
  earnRateDisplay?: string;
  earnMultiple?: number | null;
  pointValueCents?: number | null;
  mechanism?: string;
  expiryDate?: string | null;
  sourceUrl?: string;
  confidence?: string;
  isPublished?: boolean;
}

export type PointsFormState = { error?: string };

interface PointsFormProps {
  action: (state: PointsFormState, formData: FormData) => Promise<PointsFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: PointsFormDefaults;
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

export function PointsForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: PointsFormProps) {
  const [state, formAction, isPending] = useActionState<PointsFormState, FormData>(
    action,
    {}
  );

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Store"
          htmlFor="merchant_id"
          hint="Optional — leave blank for a program-wide offer."
        >
          <select
            id="merchant_id"
            name="merchant_id"
            defaultValue={defaultValues?.merchantId ?? ""}
            className={controlClass}
          >
            <option value="">Program-wide (no store)</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Program"
          htmlFor="program"
          hint='Loyalty program, e.g. "Everyday Rewards", "Flybuys".'
        >
          <Input
            id="program"
            name="program"
            required
            defaultValue={defaultValues?.program ?? ""}
          />
        </Field>

        <Field label="Mechanism" htmlFor="mechanism">
          <select
            id="mechanism"
            name="mechanism"
            required
            defaultValue={defaultValues?.mechanism ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a mechanism…
            </option>
            {MECHANISM_OPTIONS.map((option) => (
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
          label="Earn multiple"
          htmlFor="earn_multiple"
          hint="Optional numeric multiplier for math, e.g. 20."
        >
          <Input
            id="earn_multiple"
            name="earn_multiple"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.earnMultiple ?? ""}
          />
        </Field>

        <Field
          label="Point value (cents)"
          htmlFor="point_value_cents"
          hint="Optional assumed value of one point, in cents."
        >
          <Input
            id="point_value_cents"
            name="point_value_cents"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.pointValueCents ?? ""}
          />
        </Field>

        <Field label="Expiry date" htmlFor="expiry_date" hint="Optional.">
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
          hint="Citation link to the offer / program page."
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
        label="Earn rate (display)"
        htmlFor="earn_rate_display"
        hint='Human-readable rate, e.g. "20x Everyday Rewards / $1".'
      >
        <textarea
          id="earn_rate_display"
          name="earn_rate_display"
          rows={2}
          defaultValue={defaultValues?.earnRateDisplay ?? ""}
          className={cn(controlClass, "min-h-16")}
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

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/points">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default PointsForm;
