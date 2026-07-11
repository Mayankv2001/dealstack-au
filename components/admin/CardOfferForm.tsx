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
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Reusable card-offer create/edit form (client island).
 *
 * Decoupled from the service-role admin repo: the parent server page passes
 * in a server `action` and default values, so none of the privileged data
 * layer is bundled into the browser. Offer type / confidence option lists are
 * duplicated here as plain constants for the same reason. Validation lives in
 * the server action; this only collects input and surfaces the returned error.
 */

const OFFER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "sign_up_bonus", label: "Sign-up bonus" },
  { value: "cashback", label: "Cashback" },
  { value: "statement_credit", label: "Statement credit" },
  { value: "points_bonus", label: "Points bonus" },
  { value: "annual_fee_discount", label: "Annual fee discount" },
];

const CONFIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "needs-verification", label: "Needs verification" },
  { value: "expired-unknown", label: "Expired / unknown" },
];

export interface CardOfferFormDefaults {
  provider?: string;
  cardName?: string;
  offerType?: string;
  bonusPoints?: number | null;
  cashbackAmount?: number | null;
  statementCreditAmount?: number | null;
  minimumSpend?: number | null;
  minimumSpendPeriod?: string | null;
  annualFee?: number | null;
  bonusStages?: { points: number; requirement: string; timing: string; withinFirstYear: boolean }[];
  pointValueCents?: number | null;
  eligibilityNotes?: string;
  offerSummary?: string;
  sourceUrl?: string;
  confidence?: string;
  expiryDate?: string | null;
  reviewByDate?: string;
  isPublished?: boolean;
}

export type CardOfferFormState = { error?: string };

interface CardOfferFormProps {
  action: (state: CardOfferFormState, formData: FormData) => Promise<CardOfferFormState>;
  submitLabel: string;
  defaultValues?: CardOfferFormDefaults;
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

export function CardOfferForm({
  action,
  submitLabel,
  defaultValues,
}: CardOfferFormProps) {
  const [state, formAction, isPending] = useActionState<CardOfferFormState, FormData>(
    action,
    {}
  );
  const sourceHref = defaultValues?.sourceUrl
    ? safeHttpsUrl(defaultValues.sourceUrl)
    : null;
  const bonusStagesText = (defaultValues?.bonusStages ?? [])
    .map(
      (stage) =>
        `${stage.points} | ${stage.requirement} | ${stage.timing} | ${stage.withinFirstYear ? "yes" : "no"}`
    )
    .join("\n");

  return (
    <Card className="max-w-2xl">
      {/* display:contents makes the form layout-transparent so Card's flex gap applies
          between CardHeader / CardContent / CardFooter — form submission is unaffected. */}
      <form action={formAction} className="contents">
        <CardHeader>
          <CardTitle>Card offer</CardTitle>
          <CardDescription>
            Manual entry — no scraping, no external source requests.
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
            <Field
              label="Provider / bank"
              htmlFor="provider"
              hint='e.g. "American Express", "NAB", "CBA".'
            >
              <Input
                id="provider"
                name="provider"
                required
                defaultValue={defaultValues?.provider ?? ""}
              />
            </Field>

            <Field
              label="Card name"
              htmlFor="card_name"
              hint='e.g. "Qantas Business Rewards Card".'
            >
              <Input
                id="card_name"
                name="card_name"
                required
                defaultValue={defaultValues?.cardName ?? ""}
              />
            </Field>

            <Field label="Offer type" htmlFor="offer_type">
              <select
                id="offer_type"
                name="offer_type"
                required
                defaultValue={defaultValues?.offerType ?? ""}
                className={controlClass}
              >
                <option value="" disabled>
                  Select an offer type…
                </option>
                {OFFER_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Confidence"
              htmlFor="confidence"
              hint="Published card offers must be Confirmed."
            >
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
              label="Bonus points"
              htmlFor="bonus_points"
              hint="Optional. Use for sign_up_bonus / points_bonus offers."
            >
              <Input
                id="bonus_points"
                name="bonus_points"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                defaultValue={defaultValues?.bonusPoints ?? ""}
              />
            </Field>

            <Field
              label="Cashback amount ($)"
              htmlFor="cashback_amount"
              hint="Optional. Use for cashback offers."
            >
              <Input
                id="cashback_amount"
                name="cashback_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.cashbackAmount ?? ""}
              />
            </Field>

            <Field
              label="Statement credit ($)"
              htmlFor="statement_credit_amount"
              hint="Optional. Use for statement_credit offers."
            >
              <Input
                id="statement_credit_amount"
                name="statement_credit_amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.statementCreditAmount ?? ""}
              />
            </Field>

            <Field
              label="Minimum spend ($)"
              htmlFor="minimum_spend"
              hint="Optional. Spend threshold to earn the bonus."
            >
              <Input
                id="minimum_spend"
                name="minimum_spend"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.minimumSpend ?? ""}
              />
            </Field>

            <Field
              label="Minimum spend period"
              htmlFor="minimum_spend_period"
              hint='Optional, human-readable, e.g. "90 days".'
            >
              <Input
                id="minimum_spend_period"
                name="minimum_spend_period"
                defaultValue={defaultValues?.minimumSpendPeriod ?? ""}
              />
            </Field>

            <Field
              label="Annual fee ($)"
              htmlFor="annual_fee"
              hint="Optional."
            >
              <Input
                id="annual_fee"
                name="annual_fee"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={defaultValues?.annualFee ?? ""}
              />
            </Field>

            <Field
              label="Estimated point value (cents)"
              htmlFor="point_value_cents"
              hint="Editorial valuation assumption used only for comparison estimates."
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

            <Field
              label="Expiry date"
              htmlFor="expiry_date"
              hint="Issuer end date only. Leave blank for a genuinely ongoing offer."
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
              label="Review-by date"
              htmlFor="review_by_date"
              hint="Required. The offer is hidden automatically after this date until re-verified."
            >
              <Input
                id="review_by_date"
                name="review_by_date"
                type="date"
                required
                defaultValue={defaultValues?.reviewByDate ?? ""}
                className="max-w-[200px]"
              />
            </Field>
          </div>

          <Field
            label="Bonus stages"
            htmlFor="bonus_stages"
            hint="One per line: points | requirement | timing | yes/no for first year."
          >
            <textarea
              id="bonus_stages"
              name="bonus_stages"
              rows={4}
              defaultValue={bonusStagesText}
              placeholder="80000 | Spend $5,000 in 90 days | Initial bonus | yes"
              className={cn(controlClass, "min-h-24 font-mono text-xs")}
            />
          </Field>

          <Field
            label="Offer summary"
            htmlFor="offer_summary"
            hint="Short, plain-English summary of the offer."
          >
            <textarea
              id="offer_summary"
              name="offer_summary"
              rows={3}
              defaultValue={defaultValues?.offerSummary ?? ""}
              className={cn(controlClass, "min-h-16")}
            />
          </Field>

          <Field
            label="Eligibility notes"
            htmlFor="eligibility_notes"
            hint="New customers only, existing-cardholder exclusions, etc."
          >
            <textarea
              id="eligibility_notes"
              name="eligibility_notes"
              rows={3}
              defaultValue={defaultValues?.eligibilityNotes ?? ""}
              className={cn(controlClass, "min-h-16")}
            />
          </Field>

          <Field
            label="Source URL"
            htmlFor="source_url"
            hint="Use the issuer's HTTPS offer or card page."
          >
            <div className="flex items-center gap-2">
              <Input
                id="source_url"
                name="source_url"
                type="url"
                placeholder="https://…"
                defaultValue={defaultValues?.sourceUrl ?? ""}
                className="flex-1"
              />
              {sourceHref ? (
                <Button asChild variant="outline" size="sm" className="shrink-0">
                  <a
                    href={sourceHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit
                  </a>
                </Button>
              ) : null}
            </div>
          </Field>

          <fieldset className="space-y-3">
            <label htmlFor="is_published" className="flex items-start gap-2.5 text-sm">
              <input
                id="is_published"
                name="is_published"
                type="checkbox"
                defaultChecked={defaultValues?.isPublished ?? false}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                <span className="font-medium text-foreground">Published</span>
                <span className="block text-[11px] leading-normal text-muted-foreground/80">
                  Requires Confirmed confidence, a current expiry, an issuer HTTPS
                  source, a matching headline value and clean copy.
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
                    Type this from the bank&rsquo;s own public page by hand. No
                    automatic fetching happens here — saving auto-updates Last
                    checked.
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
                <Link href="/admin/card-offers">Cancel</Link>
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

export default CardOfferForm;
