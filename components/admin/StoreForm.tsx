"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Reusable store create/edit form (client island).
 *
 * Decoupled from the service-role admin repo: the parent server page passes in a
 * server `action` and default values, so none of the privileged data layer is
 * bundled into the browser. Validation lives in the server action; this only
 * collects input and surfaces the returned error.
 *
 * The store id is IMMUTABLE. On create it is an editable text input; on edit it
 * is rendered read-only with no `name`, so the browser never submits it and the
 * update action always uses the route param instead (renaming an id would
 * silently orphan every offer/signal that references the store).
 */

// Matches the DB CHECK on stores.cashback_provider. NEVER add Cashrewards.
const CASHBACK_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "—", label: "— (none)" },
  { value: "ShopBack", label: "ShopBack" },
  { value: "TopCashback", label: "TopCashback" },
];

export interface StoreFormDefaults {
  id?: string;
  name?: string;
  category?: string;
  logo?: string;
  logoPath?: string | null;
  logoText?: string | null;
  logoSubtext?: string | null;
  /** Raw JSON string for the jsonb theme (pre-serialised by the edit page). */
  logoTheme?: string;
  // Percent columns arrive back from Postgres as strings — accept either.
  discountPercent?: number | string | null;
  discountCode?: string;
  expiryDate?: string | null;
  cashbackPercent?: number | string | null;
  cashbackProvider?: string;
  giftCardDiscountPercent?: number | string | null;
  giftCardSource?: string;
  pointsProgram?: string;
  pointsRate?: string;
  aliases?: string[];
  isPublished?: boolean;
  sortOrder?: number | string | null;
}

export type StoreFormState = { error?: string };

interface StoreFormProps {
  action: (state: StoreFormState, formData: FormData) => Promise<StoreFormState>;
  submitLabel: string;
  /** create → editable id input; edit → read-only id, never submitted. */
  mode: "create" | "edit";
  defaultValues?: StoreFormDefaults;
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
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="text-[11px] leading-normal text-muted-foreground/80">{hint}</p>
      ) : null}
    </div>
  );
}

export function StoreForm({
  action,
  submitLabel,
  mode,
  defaultValues,
}: StoreFormProps) {
  const [state, formAction, isPending] = useActionState<StoreFormState, FormData>(
    action,
    {}
  );

  return (
    <Card className="max-w-2xl">
      {/* display:contents makes the form layout-transparent so Card's flex gap applies
          between CardHeader / CardContent / CardFooter — form submission is unaffected. */}
      <form action={formAction} className="contents">
        <CardHeader>
          <CardTitle>Store</CardTitle>
          <CardDescription>
            Manual entry — no scraping, no external source requests. Stores are
            core content: the id is the public URL and the join key for offers.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {state?.error ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {mode === "create" ? (
              <Field
                label="Store id"
                htmlFor="id"
                hint="Permanent public URL slug: lowercase letters, numbers and hyphens (2–40 chars), e.g. jb-hifi. Cannot be changed later."
              >
                <Input
                  id="id"
                  name="id"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="jb-hifi"
                  defaultValue={defaultValues?.id ?? ""}
                />
              </Field>
            ) : (
              <Field
                label="Store id"
                htmlFor="id_display"
                hint="Permanent — the public /stores URL and the key offers link to. It cannot be changed."
              >
                {/* No `name`, so this is never submitted; the update action uses
                    the route id. Disabled + shown so the admin sees which store. */}
                <Input
                  id="id_display"
                  value={defaultValues?.id ?? ""}
                  disabled
                  readOnly
                />
              </Field>
            )}

            <Field label="Name" htmlFor="name" hint='Display name, e.g. "JB Hi-Fi".'>
              <Input
                id="name"
                name="name"
                required
                defaultValue={defaultValues?.name ?? ""}
              />
            </Field>

            <Field
              label="Category"
              htmlFor="category"
              hint='e.g. "Electronics", "Groceries", "Department Store".'
            >
              <Input
                id="category"
                name="category"
                required
                defaultValue={defaultValues?.category ?? ""}
              />
            </Field>

            <Field
              label="Logo (initials / placeholder)"
              htmlFor="logo"
              hint='Short text/initials shown when no logo image is set, e.g. "JB".'
            >
              <Input
                id="logo"
                name="logo"
                required
                defaultValue={defaultValues?.logo ?? ""}
              />
            </Field>

            <Field
              label="Cashback provider"
              htmlFor="cashback_provider"
              hint="ShopBack, TopCashback, or — (none). Cashrewards is not supported."
            >
              <select
                id="cashback_provider"
                name="cashback_provider"
                required
                defaultValue={defaultValues?.cashbackProvider ?? "—"}
                className={controlClass}
              >
                {CASHBACK_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Sort order"
              htmlFor="sort_order"
              hint="Lower sorts first in the store grid. Default 0."
            >
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                step="1"
                inputMode="numeric"
                defaultValue={defaultValues?.sortOrder ?? 0}
              />
            </Field>

            <Field
              label="Discount (%)"
              htmlFor="discount_percent"
              hint="Best known public discount code, 0–100."
            >
              <Input
                id="discount_percent"
                name="discount_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.discountPercent ?? 0}
              />
            </Field>

            <Field
              label="Discount code"
              htmlFor="discount_code"
              hint="Optional public code paired with the discount above."
            >
              <Input
                id="discount_code"
                name="discount_code"
                defaultValue={defaultValues?.discountCode ?? ""}
              />
            </Field>

            <Field
              label="Cashback (%)"
              htmlFor="cashback_percent"
              hint="Best known cashback rate, 0–100."
            >
              <Input
                id="cashback_percent"
                name="cashback_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.cashbackPercent ?? 0}
              />
            </Field>

            <Field
              label="Gift card discount (%)"
              htmlFor="gift_card_discount_percent"
              hint="Typical discounted gift-card saving, 0–100."
            >
              <Input
                id="gift_card_discount_percent"
                name="gift_card_discount_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.giftCardDiscountPercent ?? 0}
              />
            </Field>

            <Field
              label="Gift card source"
              htmlFor="gift_card_source"
              hint='Optional, e.g. "Coles / Woolworths gift cards".'
            >
              <Input
                id="gift_card_source"
                name="gift_card_source"
                defaultValue={defaultValues?.giftCardSource ?? ""}
              />
            </Field>

            <Field
              label="Points program"
              htmlFor="points_program"
              hint='e.g. "Flybuys", "Everyday Rewards", or — for none.'
            >
              <Input
                id="points_program"
                name="points_program"
                defaultValue={defaultValues?.pointsProgram ?? ""}
              />
            </Field>

            <Field
              label="Points rate"
              htmlFor="points_rate"
              hint='Optional, human-readable, e.g. "1 pt / $1".'
            >
              <Input
                id="points_rate"
                name="points_rate"
                defaultValue={defaultValues?.pointsRate ?? ""}
              />
            </Field>

            <Field
              label="Expiry date"
              htmlFor="expiry_date"
              hint="Optional. Sample expiry for the discount code deal."
            >
              <Input
                id="expiry_date"
                name="expiry_date"
                type="date"
                defaultValue={defaultValues?.expiryDate ?? ""}
                className="max-w-[200px]"
              />
            </Field>

            <Field
              label="Logo image path"
              htmlFor="logo_path"
              hint='Optional local asset in public/logos, e.g. "/logos/myer.svg". Do not hotlink or scrape.'
            >
              <Input
                id="logo_path"
                name="logo_path"
                defaultValue={defaultValues?.logoPath ?? ""}
              />
            </Field>

            <Field
              label="Logo wordmark"
              htmlFor="logo_text"
              hint='Optional short wordmark for the CSS tile, e.g. "MYER".'
            >
              <Input
                id="logo_text"
                name="logo_text"
                defaultValue={defaultValues?.logoText ?? ""}
              />
            </Field>

            <Field
              label="Logo subtext"
              htmlFor="logo_subtext"
              hint="Optional tiny subtext under the wordmark."
            >
              <Input
                id="logo_subtext"
                name="logo_subtext"
                defaultValue={defaultValues?.logoSubtext ?? ""}
              />
            </Field>
          </div>

          <Field
            label="Aliases"
            htmlFor="aliases"
            hint="One per line. Used for merchant matching and search (stored lowercased, trimmed). e.g. jb hifi / jbhifi."
          >
            <textarea
              id="aliases"
              name="aliases"
              rows={4}
              defaultValue={(defaultValues?.aliases ?? []).join("\n")}
              className={cn(controlClass, "min-h-24 font-mono")}
            />
          </Field>

          <Field
            label="Logo theme (JSON)"
            htmlFor="logo_theme"
            hint='Optional raw JSON for the CSS logo tile, e.g. {"bg":"#111","fg":"#fff"}. Leave blank for none.'
          >
            <textarea
              id="logo_theme"
              name="logo_theme"
              rows={3}
              defaultValue={defaultValues?.logoTheme ?? ""}
              className={cn(controlClass, "min-h-16 font-mono")}
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
                <span className="font-medium text-foreground">Published</span>
                <span className="block text-[11px] leading-normal text-muted-foreground/80">
                  Shows the store page and store-grid entry. Unpublishing hides
                  those, but offers referencing this store stay published —
                  unpublish them separately.
                </span>
              </span>
            </label>
          </fieldset>
        </CardContent>

        <CardFooter>
          <div className="flex w-full flex-col gap-4">
            {/* Manual-entry callout */}
            <div className="w-full rounded-r-md border-l-4 border-amber-500 bg-amber-50/50 p-3 dark:bg-amber-950/25">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
                    Manual entry only
                  </p>
                  <p className="text-[11px] leading-normal text-muted-foreground/80">
                    Type store details by hand. No automatic fetching happens
                    here. The store id is permanent once created.
                  </p>
                </div>
              </div>
            </div>

            {/* Submit row */}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : submitLabel}
              </Button>
              <Button asChild variant="ghost">
                <Link href="/admin/stores">Cancel</Link>
              </Button>
              <span className="ml-auto hidden text-[11px] text-muted-foreground/70 sm:inline">
                Changes write instantly to Supabase.
              </span>
            </div>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default StoreForm;
