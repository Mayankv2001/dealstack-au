"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable OzBargain signal create/edit form (client island).
 *
 * It is intentionally decoupled from the service-role admin repo: the parent
 * server page passes in a server `action` and the plain `stores` list, so none
 * of the privileged data layer is bundled into the browser. The option lists are
 * duplicated here as plain constants for the same reason. Validation lives in the
 * server action; this only collects input and surfaces the returned error.
 */

const SENTIMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "neutral", label: "Neutral" },
  { value: "warning", label: "Warning" },
  { value: "expired", label: "Expired" },
];

const DEAL_KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "discount-code", label: "Discount code" },
  { value: "cashback", label: "Cashback" },
  { value: "gift-card", label: "Gift card" },
  { value: "points", label: "Points" },
  { value: "guide", label: "Guide" },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "hidden", label: "Hidden" },
  { value: "expired", label: "Expired" },
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

export interface SignalFormDefaults {
  merchantId?: string | null;
  title?: string;
  summary?: string;
  votesSample?: number | null;
  commentCount?: number | null;
  sentiment?: string;
  dealKind?: string;
  sourceUrl?: string;
  merchantUrl?: string | null;
  productUrl?: string | null;
  postedAt?: string | null;
  expiryDate?: string | null;
  tags?: string[];
  promoCode?: string | null;
  priceText?: string | null;
  signalScore?: number | null;
  confidence?: string;
  isSample?: boolean;
  status?: string;
}

export type SignalFormState = { error?: string };

interface SignalFormProps {
  action: (state: SignalFormState, formData: FormData) => Promise<SignalFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: SignalFormDefaults;
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

export function SignalForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: SignalFormProps) {
  const [state, formAction, isPending] = useActionState<SignalFormState, FormData>(
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

      <Field
        label="Title"
        htmlFor="title"
        hint="Headline only — our own paraphrase, never copied content."
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
          label="Store"
          htmlFor="merchant_id"
          hint="Optional — leave blank for a non-merchant signal."
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

        <Field label="Status" htmlFor="status">
          <select
            id="status"
            name="status"
            required
            defaultValue={defaultValues?.status ?? "pending"}
            className={controlClass}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Sentiment" htmlFor="sentiment">
          <select
            id="sentiment"
            name="sentiment"
            required
            defaultValue={defaultValues?.sentiment ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a sentiment…
            </option>
            {SENTIMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Deal kind" htmlFor="deal_kind">
          <select
            id="deal_kind"
            name="deal_kind"
            required
            defaultValue={defaultValues?.dealKind ?? ""}
            className={controlClass}
          >
            <option value="" disabled>
              Select a deal kind…
            </option>
            {DEAL_KIND_OPTIONS.map((option) => (
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
          label="Signal score"
          htmlFor="signal_score"
          hint="Optional 0–1 heuristic score."
        >
          <Input
            id="signal_score"
            name="signal_score"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            defaultValue={defaultValues?.signalScore ?? ""}
          />
        </Field>

        <Field label="Votes (sample)" htmlFor="votes_sample" hint="Optional.">
          <Input
            id="votes_sample"
            name="votes_sample"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={defaultValues?.votesSample ?? ""}
          />
        </Field>

        <Field label="Comment count" htmlFor="comment_count" hint="Optional.">
          <Input
            id="comment_count"
            name="comment_count"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            defaultValue={defaultValues?.commentCount ?? ""}
          />
        </Field>

        <Field label="Posted date" htmlFor="posted_at" hint="Optional.">
          <Input
            id="posted_at"
            name="posted_at"
            type="date"
            defaultValue={defaultValues?.postedAt ?? ""}
          />
        </Field>

        <Field
          label="Expiry date"
          htmlFor="expiry_date"
          hint="Optional. When set, the DQ report flags this signal as expired once the date passes."
        >
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            defaultValue={defaultValues?.expiryDate ?? ""}
          />
        </Field>

        <Field label="Promo code" htmlFor="promo_code" hint="Optional.">
          <Input
            id="promo_code"
            name="promo_code"
            defaultValue={defaultValues?.promoCode ?? ""}
          />
        </Field>

        <Field
          label="Price text"
          htmlFor="price_text"
          hint='Optional, e.g. "$1,799 (was $1,999)".'
        >
          <Input
            id="price_text"
            name="price_text"
            defaultValue={defaultValues?.priceText ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Source URL"
        htmlFor="source_url"
        hint="Required. Link to the OzBargain post (or placeholder for samples)."
      >
        <Input
          id="source_url"
          name="source_url"
          type="url"
          required
          placeholder="https://…"
          defaultValue={defaultValues?.sourceUrl ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Merchant URL"
          htmlFor="merchant_url"
          hint="Optional retailer homepage."
        >
          <Input
            id="merchant_url"
            name="merchant_url"
            type="url"
            placeholder="https://…"
            defaultValue={defaultValues?.merchantUrl ?? ""}
          />
        </Field>

        <Field
          label="Product URL"
          htmlFor="product_url"
          hint="Optional exact product / category page."
        >
          <Input
            id="product_url"
            name="product_url"
            type="url"
            placeholder="https://…"
            defaultValue={defaultValues?.productUrl ?? ""}
          />
        </Field>
      </div>

      <Field
        label="Tags"
        htmlFor="tags"
        hint="Optional. Comma- or newline-separated labels."
      >
        <textarea
          id="tags"
          name="tags"
          rows={2}
          defaultValue={(defaultValues?.tags ?? []).join(", ")}
          className={cn(controlClass, "min-h-16")}
        />
      </Field>

      <fieldset className="space-y-3">
        <label htmlFor="is_sample" className="flex items-start gap-2.5 text-sm">
          <input
            id="is_sample"
            name="is_sample"
            type="checkbox"
            defaultChecked={defaultValues?.isSample ?? false}
            className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
          />
          <span>
            <span className="font-medium">Sample signal</span>
            <span className="block text-xs text-muted-foreground">
              Placeholder example — the source URL is not a real live post.
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
          <Link href="/admin/signals">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default SignalForm;
