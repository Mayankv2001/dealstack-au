"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable gift-card create/edit form (client island).
 *
 * It is intentionally decoupled from the service-role admin repo: the parent
 * server page passes in a server `action` and the plain `stores` list, so none
 * of the privileged data layer is bundled into the browser. Channel, purchase
 * method and confidence option lists are duplicated here as plain constants for
 * the same reason. Validation lives in the server action; this only collects
 * input and surfaces the returned error.
 */

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: "membership-portal", label: "Membership portal" },
  { value: "supermarket-promo", label: "Supermarket promo" },
  { value: "bank-benefit", label: "Bank benefit" },
];

const PURCHASE_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Not set" },
  { value: "online", label: "Online" },
  { value: "in-store", label: "In-store" },
  { value: "online-and-in-store", label: "Online & in-store" },
  { value: "unknown", label: "Unknown" },
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

export interface GiftCardFormDefaults {
  brand?: string;
  discountPercent?: number;
  channel?: string;
  source?: string;
  acceptedAtMerchantIds?: string[];
  pointsProgram?: string;
  pointsEarnNote?: string;
  capDollars?: number | null;
  startDate?: string | null;
  expiryDate?: string | null;
  purchaseLocation?: string | null;
  purchaseMethod?: string;
  limitPerCustomer?: string | null;
  acceptedAt?: string[];
  usageNotes?: string[];
  stackNotes?: string[];
  sourceDetailUrl?: string | null;
  sourceUrl?: string;
  confidence?: string;
  isPublished?: boolean;
}

export type GiftCardFormState = { error?: string };

interface GiftCardFormProps {
  action: (state: GiftCardFormState, formData: FormData) => Promise<GiftCardFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: GiftCardFormDefaults;
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

/** Joins a string[] default into newline-separated textarea text. */
function lines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}

export function GiftCardForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: GiftCardFormProps) {
  const [state, formAction, isPending] = useActionState<GiftCardFormState, FormData>(
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
          label="Brand"
          htmlFor="brand"
          hint='Gift card brand, e.g. "Coles Group", "Ultimate", "Apple".'
        >
          <Input
            id="brand"
            name="brand"
            required
            defaultValue={defaultValues?.brand ?? ""}
          />
        </Field>

        <Field
          label="Source"
          htmlFor="source"
          hint='Where the card is bought from, e.g. "RACV Member Benefits".'
        >
          <Input
            id="source"
            name="source"
            required
            defaultValue={defaultValues?.source ?? ""}
          />
        </Field>

        <Field label="Discount (%)" htmlFor="discount_percent">
          <Input
            id="discount_percent"
            name="discount_percent"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.discountPercent ?? 0}
          />
        </Field>

        <Field label="Channel" htmlFor="channel">
          <select
            id="channel"
            name="channel"
            required
            defaultValue={defaultValues?.channel ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a channel…
            </option>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Cap ($)"
          htmlFor="cap_dollars"
          hint="Optional per-offer / per-transaction cap."
        >
          <Input
            id="cap_dollars"
            name="cap_dollars"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.capDollars ?? ""}
          />
        </Field>

        <Field label="Purchase method" htmlFor="purchase_method">
          <select
            id="purchase_method"
            name="purchase_method"
            defaultValue={defaultValues?.purchaseMethod ?? ""}
            className={controlClass}
          >
            {PURCHASE_METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Start date" htmlFor="start_date" hint="Optional.">
          <Input
            id="start_date"
            name="start_date"
            type="date"
            defaultValue={defaultValues?.startDate ?? ""}
          />
        </Field>

        <Field
          label="Expiry date"
          htmlFor="expiry_date"
          hint="Optional. When set, the DQ report flags this offer as expired once the date passes."
        >
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            defaultValue={defaultValues?.expiryDate ?? ""}
          />
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
          label="Limit per customer"
          htmlFor="limit_per_customer"
          hint="Optional, human-readable."
        >
          <Input
            id="limit_per_customer"
            name="limit_per_customer"
            defaultValue={defaultValues?.limitPerCustomer ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Accepted at (stores)"
        htmlFor="accepted_at_merchant_ids"
        hint="Hold ⌘/Ctrl to select every store where this card can be spent."
      >
        <select
          id="accepted_at_merchant_ids"
          name="accepted_at_merchant_ids"
          multiple
          defaultValue={defaultValues?.acceptedAtMerchantIds ?? []}
          className={cn(controlClass, "min-h-40")}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Points program (on purchase)"
          htmlFor="points_program"
          hint='Optional. Program earned for buying the card, e.g. "Flybuys".'
        >
          <Input
            id="points_program"
            name="points_program"
            defaultValue={defaultValues?.pointsProgram ?? ""}
          />
        </Field>

        <Field
          label="Points earn note"
          htmlFor="points_earn_note"
          hint="Optional. Short description of the bonus earn."
        >
          <Input
            id="points_earn_note"
            name="points_earn_note"
            defaultValue={defaultValues?.pointsEarnNote ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Purchase location"
        htmlFor="purchase_location"
        hint='Optional, e.g. "RACV Member Benefits portal".'
      >
        <Input
          id="purchase_location"
          name="purchase_location"
          defaultValue={defaultValues?.purchaseLocation ?? ""}
        />
      </Field>

      <Field
        label="Accepted at (retailers)"
        htmlFor="accepted_at"
        hint="Optional. One human-readable retailer per line."
      >
        <textarea
          id="accepted_at"
          name="accepted_at"
          rows={3}
          defaultValue={lines(defaultValues?.acceptedAt)}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <Field
        label="Usage notes"
        htmlFor="usage_notes"
        hint="Optional. One note per line, in our own words."
      >
        <textarea
          id="usage_notes"
          name="usage_notes"
          rows={3}
          defaultValue={lines(defaultValues?.usageNotes)}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <Field
        label="Stack notes"
        htmlFor="stack_notes"
        hint="Optional. How this card stacks with codes / cashback / points — one per line."
      >
        <textarea
          id="stack_notes"
          name="stack_notes"
          rows={3}
          defaultValue={lines(defaultValues?.stackNotes)}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Source URL (citation)"
          htmlFor="source_url"
          hint="Citation link to the offer page. Needed to pass the data-quality source check."
        >
          <Input
            id="source_url"
            name="source_url"
            type="url"
            placeholder="https://…"
            defaultValue={defaultValues?.sourceUrl ?? ""}
          />
        </Field>

        <Field
          label="Source detail URL"
          htmlFor="source_detail_url"
          hint="Optional link to a fuller offer-detail page."
        >
          <Input
            id="source_detail_url"
            name="source_detail_url"
            type="url"
            placeholder="https://…"
            defaultValue={defaultValues?.sourceDetailUrl ?? ""}
          />
        </Field>
      </div>

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
          <span className="font-medium text-foreground">Saving this form</span>{" "}
          auto-updates Last&nbsp;checked — this clears any stale data-quality flag.
        </p>
        <p>Admin edits take effect on the live site immediately; seed scripts are for demo reset only.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/gift-cards">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default GiftCardForm;
