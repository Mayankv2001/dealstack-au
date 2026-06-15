import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Check, ShieldCheck, X } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listComplianceReviews,
  type AdminComplianceReview,
} from "@/lib/admin/repos/compliance";
import {
  COMPLIANCE_WARNING,
  ComplianceReviewForm,
} from "@/components/admin/ComplianceReviewForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createReview, updateReview } from "./actions";

export const metadata: Metadata = {
  title: "Compliance review | DealStack AU admin",
};

type BoolKey =
  | "robotsTxtChecked"
  | "termsChecked"
  | "feedPathsAllowed"
  | "userAgentRecorded"
  | "rateLimitRecorded";

const REVIEW_CHECKS: { key: BoolKey; label: string }[] = [
  { key: "robotsTxtChecked", label: "robots.txt checked" },
  { key: "termsChecked", label: "Terms reviewed" },
  { key: "feedPathsAllowed", label: "Feed paths allowed" },
  { key: "userAgentRecorded", label: "User-Agent recorded" },
  { key: "rateLimitRecorded", label: "Rate limit recorded" },
];

// Deterministic AU-local timestamp (server-only render).
const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : "—";
}

function CheckLine({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {ok ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <X className="size-3.5 text-muted-foreground" />
      )}
      <span className={ok ? "text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
    </span>
  );
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();

  const { edit } = await searchParams;
  const editId = Array.isArray(edit) ? edit[0] : edit;
  const reviews = await listComplianceReviews();
  const editing = editId
    ? reviews.find((r) => r.id === editId) ?? null
    : null;

  const hasApproved = reviews.some((r) => r.approvedForMonitoring);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">
          Compliance review
        </h1>
        <p className="text-sm text-muted-foreground">
          Record the OzBargain pre-flight review. This is the gate for the
          planned monitor — registration only, no fetching.
        </p>
      </header>

      {/* Always-visible gate warning + current status. */}
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">{COMPLIANCE_WARNING}</p>
          <p className="text-muted-foreground">
            {hasApproved ? (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                An approved review is on file. Enabling a feed is still a
                separate, deliberate step.
              </span>
            ) : (
              "No approved review on file — monitoring must stay off."
            )}
          </p>
        </div>
      </div>

      {/* Create / edit form. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {editing
              ? `Edit review — ${editing.sourceName}`
              : "Record a new review"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <ComplianceReviewForm
              action={updateReview.bind(null, editing.id)}
              submitLabel="Save changes"
              defaultValues={{
                sourceName: editing.sourceName,
                robotsTxtChecked: editing.robotsTxtChecked,
                termsChecked: editing.termsChecked,
                feedPathsAllowed: editing.feedPathsAllowed,
                userAgentRecorded: editing.userAgentRecorded,
                rateLimitRecorded: editing.rateLimitRecorded,
                approvedForMonitoring: editing.approvedForMonitoring,
                notes: editing.notes ?? "",
              }}
            />
          ) : (
            <ComplianceReviewForm
              action={createReview}
              submitLabel="Record review"
            />
          )}
        </CardContent>
      </Card>

      {/* Existing reviews. */}
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Review records</h2>
        {reviews.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No compliance reviews recorded yet.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review: AdminComplianceReview) => (
              <Card key={review.id} className="flex flex-col">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {review.sourceName}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={cn(
                        review.approvedForMonitoring
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "text-muted-foreground"
                      )}
                    >
                      {review.approvedForMonitoring
                        ? "Approved for monitoring"
                        : "Not approved"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-3">
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {REVIEW_CHECKS.map((check) => (
                      <CheckLine
                        key={check.key}
                        ok={review[check.key]}
                        label={check.label}
                      />
                    ))}
                  </div>
                  {review.notes ? (
                    <p className="text-sm text-muted-foreground">
                      {review.notes}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Reviewer: {review.reviewerEmail ?? "—"}</span>
                    <span>Approved at: {formatDate(review.reviewedAt)}</span>
                    <span>Updated: {formatDate(review.updatedAt)}</span>
                  </div>
                  <div>
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/compliance?edit=${review.id}`}>
                        Edit
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
