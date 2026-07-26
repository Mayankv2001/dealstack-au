"use client";

import type { ReactNode } from "react";
import { useActionState } from "react";
import Link from "next/link";
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
 * Transfer-bonus create/edit form (client island).
 *
 * Decoupled from the service-role repo the same way PointsForm is: the parent
 * server page passes in the server `action`, and the option lists are plain
 * constants here so none of the privileged data layer reaches the browser.
 * Validation lives in the server action; this only collects input.
 *
 * Deliberately has NO "published" checkbox — a bonus is always created as a
 * draft and published from the list, so a transfer promotion cannot go live in
 * the same keystroke that creates it.
 */

const PROGRAMME_OPTIONS: { value: string; label: string }[] = [
  { value: "everyday-rewards", label: "Everyday Rewards" },
  { value: "flybuys", label: "Flybuys" },
  { value: "qantas-frequent-flyer", label: "Qantas Frequent Flyer" },
  { value: "velocity-frequent-flyer", label: "Velocity Frequent Flyer" },
];

const CONFIDENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "needs-verification", label: "Needs verification" },
  { value: "expired-unknown", label: "Expired / unknown" },
];

const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "freepoints", label: "FreePoints" },
  { value: "pointhacks", label: "Point Hacks" },
  { value: "manual", label: "DealStack record" },
];

export type TransferBonusFormState = { error?: string };

export interface TransferBonusFormDefaults {
  fromProgramme?: string;
  toProgramme?: string;
  bonusPercentMin?: number;
  bonusPercentMax?: number;
  startsOn?: string | null;
  expiryDate?: string | null;
  conditionsNote?: string | null;
  sourceUrl?: string;
  sourceId?: string;
  confidence?: string;
}

const controlClass =
  "h-10 w-full rounded-lg border bg-background px-3 text-sm";

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
        <p className="text-[11px] leading-normal text-muted-foreground/80">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TransferBonusForm({
  action,
  submitLabel,
  defaultValues,
}: {
  action: (
    prev: TransferBonusFormState,
    formData: FormData
  ) => Promise<TransferBonusFormState>;
  submitLabel: string;
  defaultValues?: TransferBonusFormDefaults;
}) {
  const [state, formAction, isPending] = useActionState<
    TransferBonusFormState,
    FormData
  >(action, {});

  return (
    <Card className="max-w-2xl">
      <form action={formAction} className="contents">
        <CardHeader>
          <CardTitle>Points transfer bonus</CardTitle>
          <CardDescription>
            A promotion on moving points between two programmes. Created as a
            draft — publish it from the list once you are happy with it.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Transfer from" htmlFor="from_programme">
              <select
                id="from_programme"
                name="from_programme"
                required
                defaultValue={defaultValues?.fromProgramme ?? ""}
                className={controlClass}
              >
                <option value="" disabled>
                  Select a programme…
                </option>
                {PROGRAMME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Transfer to"
              htmlFor="to_programme"
              hint="Must differ from the source programme."
            >
              <select
                id="to_programme"
                name="to_programme"
                required
                defaultValue={defaultValues?.toProgramme ?? ""}
                className={controlClass}
              >
                <option value="" disabled>
                  Select a programme…
                </option>
                {PROGRAMME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Bonus % (minimum)"
              htmlFor="bonus_percent_min"
              hint="For a flat bonus, set both fields to the same number."
            >
              <Input
                id="bonus_percent_min"
                name="bonus_percent_min"
                type="number"
                min="0"
                max="100"
                step="0.5"
                required
                defaultValue={defaultValues?.bonusPercentMin ?? ""}
              />
            </Field>

            <Field label="Bonus % (maximum)" htmlFor="bonus_percent_max">
              <Input
                id="bonus_percent_max"
                name="bonus_percent_max"
                type="number"
                min="0"
                max="100"
                step="0.5"
                required
                defaultValue={defaultValues?.bonusPercentMax ?? ""}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts on" htmlFor="starts_on" hint="Optional.">
              <Input
                id="starts_on"
                name="starts_on"
                type="date"
                defaultValue={defaultValues?.startsOn ?? ""}
              />
            </Field>

            <Field
              label="Ends on"
              htmlFor="expiry_date"
              hint="Live through the whole of this Sydney day, then auto-unpublished."
            >
              <Input
                id="expiry_date"
                name="expiry_date"
                type="date"
                defaultValue={defaultValues?.expiryDate ?? ""}
              />
            </Field>
          </div>

          <Field
            label="Conditions"
            htmlFor="conditions_note"
            hint="Our own short wording — never copy the source's sentence."
          >
            <textarea
              id="conditions_note"
              name="conditions_note"
              rows={2}
              defaultValue={defaultValues?.conditionsNote ?? ""}
              className={cn(controlClass, "h-auto py-2")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Source" htmlFor="source_id">
              <select
                id="source_id"
                name="source_id"
                defaultValue={defaultValues?.sourceId ?? "freepoints"}
                className={controlClass}
              >
                {SOURCE_OPTIONS.map((option) => (
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
                defaultValue={defaultValues?.confidence ?? "confirmed"}
                className={controlClass}
              >
                {CONFIDENCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="Source URL"
            htmlFor="source_url"
            hint="Required. HTTPS only. A bonus is a claim about someone else's programme, so it must cite where it came from."
          >
            <Input
              id="source_url"
              name="source_url"
              type="url"
              required
              defaultValue={defaultValues?.sourceUrl ?? ""}
            />
          </Field>

          {state.error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : submitLabel}
            </Button>
            <Link
              href="/admin/transfer-bonuses"
              className="text-sm font-semibold text-muted-foreground hover:underline"
            >
              Cancel
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default TransferBonusForm;
