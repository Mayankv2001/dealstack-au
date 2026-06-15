"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Reusable compliance review create/edit form (client island).
 *
 * Decoupled from the service-role admin repo: the parent server page passes in a
 * server `action`, so none of the privileged data layer is bundled into the
 * browser. Validation lives in the server action; this only collects input and
 * surfaces the returned error. The reviewer email and approval timestamp are
 * stamped server-side, not entered here.
 */

export const COMPLIANCE_WARNING =
  "Automated fetching must not be enabled until compliance review is approved.";

const CHECK_FIELDS: { name: string; label: string; hint: string }[] = [
  {
    name: "robots_txt_checked",
    label: "robots.txt checked",
    hint: "Confirmed the intended feed paths are not disallowed.",
  },
  {
    name: "terms_checked",
    label: "Terms / feed policy reviewed",
    hint: "Confirmed low-volume RSS syndication is permitted.",
  },
  {
    name: "feed_paths_allowed",
    label: "Feed paths allowed",
    hint: "The exact feed URLs to use are permitted.",
  },
  {
    name: "user_agent_recorded",
    label: "User-Agent recorded",
    hint: "An identifying User-Agent with a contact URL is decided.",
  },
  {
    name: "rate_limit_recorded",
    label: "Rate limit recorded",
    hint: "An acceptable polling cadence / limit is documented.",
  },
];

export interface ComplianceReviewFormDefaults {
  sourceName?: string;
  robotsTxtChecked?: boolean;
  termsChecked?: boolean;
  feedPathsAllowed?: boolean;
  userAgentRecorded?: boolean;
  rateLimitRecorded?: boolean;
  approvedForMonitoring?: boolean;
  notes?: string;
}

export type ComplianceReviewFormState = { error?: string };

interface ComplianceReviewFormProps {
  action: (
    state: ComplianceReviewFormState,
    formData: FormData
  ) => Promise<ComplianceReviewFormState>;
  submitLabel: string;
  defaultValues?: ComplianceReviewFormDefaults;
}

const controlClass =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30";

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

export function ComplianceReviewForm({
  action,
  submitLabel,
  defaultValues,
}: ComplianceReviewFormProps) {
  const [state, formAction, isPending] = useActionState<
    ComplianceReviewFormState,
    FormData
  >(action, {});

  const checkDefaults: Record<string, boolean | undefined> = {
    robots_txt_checked: defaultValues?.robotsTxtChecked,
    terms_checked: defaultValues?.termsChecked,
    feed_paths_allowed: defaultValues?.feedPathsAllowed,
    user_agent_recorded: defaultValues?.userAgentRecorded,
    rate_limit_recorded: defaultValues?.rateLimitRecorded,
  };

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

      <div className="space-y-1.5">
        <label htmlFor="source_name" className="text-sm font-medium">
          Source name
        </label>
        <Input
          id="source_name"
          name="source_name"
          required
          defaultValue={defaultValues?.sourceName ?? "OzBargain"}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Pre-flight checklist</legend>
        {CHECK_FIELDS.map((field) => (
          <CheckboxField
            key={field.name}
            name={field.name}
            label={field.label}
            hint={field.hint}
            defaultChecked={checkDefaults[field.name] ?? false}
          />
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="notes" className="text-sm font-medium">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={4}
          placeholder="Links reviewed, allowed feed URLs, decisions, follow-ups…"
          defaultValue={defaultValues?.notes ?? ""}
          className={cn(controlClass, "min-h-20")}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
        <CheckboxField
          name="approved_for_monitoring"
          label="Approved for monitoring"
          hint={COMPLIANCE_WARNING}
          defaultChecked={defaultValues?.approvedForMonitoring ?? false}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin/compliance">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}

export default ComplianceReviewForm;
