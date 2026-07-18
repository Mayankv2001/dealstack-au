"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable cashback create/edit form (client island).
 *
 * It is intentionally decoupled from the service-role admin repo: the parent
 * server page passes in a server `action` and the plain `stores` list, so none
 * of the privileged data layer is bundled into the browser. Provider and
 * confidence option lists are duplicated here as plain constants for the same
 * reason — Cashrewards is deliberately not an option. Validation lives in the
 * server action; this only collects input and surfaces the returned error.
 */

const PROVIDERS = ["ShopBack", "TopCashback"] as const;

const CONFIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "needs-verification", label: "Needs verification" },
  { value: "expired-unknown", label: "Expired / unknown" },
];

export interface StoreOption {
  id: string;
  name: string;
}

export interface CashbackFormDefaults {
  merchantId?: string;
  provider?: string;
  ratePercent?: number;
  flatAmount?: number | null;
  capDollars?: number | null;
  isUpsized?: boolean;
  excludesGiftCardPayment?: boolean;
  termsSummary?: string;
  expiryDate?: string | null;
  confidence?: string;
  sourceUrl?: string;
  isPublished?: boolean;
}

export type CashbackFormState = { error?: string };

interface CashbackFormProps {
  action: (state: CashbackFormState, formData: FormData) => Promise<CashbackFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: CashbackFormDefaults;
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

function CheckboxField({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label htmlFor={name} className="flex items-start gap-2.5 text-sm">
      <input
        id={name}
        name={name}
        type="checkbox"
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}

export function CashbackForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: CashbackFormProps) {
  const [state, formAction, isPending] = useActionState<CashbackFormState, FormData>(
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
        <Field label="Store" htmlFor="merchant_id">
          <select
            id="merchant_id"
            name="merchant_id"
            required
            defaultValue={defaultValues?.merchantId ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a store…
            </option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Provider" htmlFor="provider">
          <select
            id="provider"
            name="provider"
            required
            defaultValue={defaultValues?.provider ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a provider…
            </option>
            {PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Rate (%)" htmlFor="rate_percent">
          <Input
            id="rate_percent"
            name="rate_percent"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.ratePercent ?? 0}
          />
        </Field>

        <Field
          label="Flat amount ($)"
          htmlFor="flat_amount"
          hint="Optional — for fixed-dollar bonuses instead of a rate."
        >
          <Input
            id="flat_amount"
            name="flat_amount"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.flatAmount ?? ""}
          />
        </Field>

        <Field
          label="Maximum cashback ($)"
          htmlFor="cap_dollars"
          hint="Maximum cashback reward paid for the transaction."
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

        <Field label="Expiry date" htmlFor="expiry_date" hint="Optional.">
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
          label="Source URL"
          htmlFor="source_url"
          hint="Citation link to the provider's offer page."
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
        label="Terms summary"
        htmlFor="terms_summary"
        hint="Short paraphrase in our own words — never copy the provider's full terms."
      >
        <textarea
          id="terms_summary"
          name="terms_summary"
          rows={3}
          defaultValue={defaultValues?.termsSummary ?? ""}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <fieldset className="space-y-3">
        <CheckboxField
          name="is_upsized"
          label="Upsized rate"
          hint="Limited-time boosted rate."
          defaultChecked={defaultValues?.isUpsized ?? false}
        />
        <CheckboxField
          name="excludes_gift_card_payment"
          label="Excludes gift card payment"
          hint="Cashback voids when the order is paid with gift cards."
          defaultChecked={defaultValues?.excludesGiftCardPayment ?? false}
        />
        <CheckboxField
          name="is_published"
          label="Published"
          hint="Visible on /deals. Uncheck to keep it as a draft."
          defaultChecked={defaultValues?.isPublished ?? true}
        />
      </fieldset>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/cashback">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default CashbackForm;
