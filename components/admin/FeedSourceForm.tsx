"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Reusable feed source create/edit form (client island).
 *
 * Decoupled from the service-role admin repo: the parent server page passes in a
 * server `action` and the plain `stores` list, so none of the privileged data
 * layer is bundled into the browser. Validation lives in the server action; this
 * only collects input and surfaces the returned error.
 *
 * No fetching/cron exists — see the warning rendered near the enable checkbox.
 */

export const FEED_ENABLE_WARNING =
  "Enabling a feed only makes it eligible for future monitor runs. No fetcher or cron is implemented yet.";

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: "front", label: "Front page" },
  { value: "store", label: "Store" },
  { value: "category", label: "Category" },
];

export interface StoreOption {
  id: string;
  name: string;
}

export interface FeedSourceFormDefaults {
  label?: string;
  feedUrl?: string;
  kind?: string;
  merchantId?: string | null;
  isEnabled?: boolean;
}

export type FeedSourceFormState = { error?: string };

interface FeedSourceFormProps {
  action: (
    state: FeedSourceFormState,
    formData: FormData
  ) => Promise<FeedSourceFormState>;
  stores: StoreOption[];
  submitLabel: string;
  defaultValues?: FeedSourceFormDefaults;
}

// Mirrors components/ui/input.tsx so native <select> looks consistent.
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

export function FeedSourceForm({
  action,
  stores,
  submitLabel,
  defaultValues,
}: FeedSourceFormProps) {
  const [state, formAction, isPending] = useActionState<
    FeedSourceFormState,
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
        label="Label"
        htmlFor="label"
        hint="A short human name, e.g. “JB Hi-Fi store feed”."
      >
        <Input
          id="label"
          name="label"
          required
          defaultValue={defaultValues?.label ?? ""}
        />
      </Field>

      <Field
        label="Feed URL"
        htmlFor="feed_url"
        hint="The RSS/Atom feed URL. Must be verified against robots.txt/ToS before enabling."
      >
        <Input
          id="feed_url"
          name="feed_url"
          type="url"
          required
          placeholder="https://…"
          defaultValue={defaultValues?.feedUrl ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind" htmlFor="kind">
          <select
            id="kind"
            name="kind"
            required
            defaultValue={defaultValues?.kind ?? "store"}
            className={controlClass}
          >
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Store"
          htmlFor="merchant_id"
          hint="Optional — link a store-specific feed to a merchant."
        >
          <select
            id="merchant_id"
            name="merchant_id"
            defaultValue={defaultValues?.merchantId ?? ""}
            className={controlClass}
          >
            <option value="">None (not store-specific)</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed bg-muted/40 p-4">
        <label htmlFor="is_enabled" className="flex items-start gap-2.5 text-sm">
          <input
            id="is_enabled"
            name="is_enabled"
            type="checkbox"
            defaultChecked={defaultValues?.isEnabled ?? false}
            className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
          />
          <span>
            <span className="font-medium">Enabled</span>
            <span className="block text-xs text-muted-foreground">
              {FEED_ENABLE_WARNING}
            </span>
          </span>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/signals/sources">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default FeedSourceForm;
