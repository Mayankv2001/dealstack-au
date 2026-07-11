import { Check, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import { safePublicHref } from "@/lib/security/urlPolicy";
import { formatDateAU } from "@/lib/sources/normalise";
import {
  SOURCE_META,
  type Citation,
  type Confidence,
  type SourceId,
} from "@/lib/sources/types";
import { cn } from "@/lib/utils";

/**
 * Shared metadata atoms for deal/offer cards — confidence pill, citation
 * badges, expiry and last-checked lines. Extracted from the retired
 * WeeklyDealCard so the card systems that survive it (cards, search, stores,
 * deal detail) keep one consistent vocabulary. Server-safe, presentation only.
 */

/** Subtle per-source tints so citations are recognisable at a glance. */
const sourceBadgeClasses: Record<SourceId, string> = {
  ozbargain:
    "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  pointhacks:
    "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  freepoints:
    "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-400",
  gcdb: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-400",
  manual:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

/** Softer, smaller confidence indicator used across offer cards. */
export function ConfidencePill({
  confidence,
  className,
}: {
  confidence: Confidence;
  className?: string;
}) {
  if (confidence === "confirmed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400",
          className
        )}
      >
        <Check className="size-3" />
        Confirmed
      </span>
    );
  }
  if (confidence === "expired-unknown") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground",
          className
        )}
      >
        <span className="size-1.5 rounded-full bg-muted-foreground/50" />
        Expired
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] text-muted-foreground",
        className
      )}
      title="Check the live offer at the source before you buy"
    >
      <span className="size-1.5 rounded-full bg-amber-500/70" />
      Check before you buy
    </span>
  );
}

export function CitationLinks({
  citations,
  className,
}: {
  citations: Citation[];
  className?: string;
}) {
  const safeCitations = citations.flatMap((citation) => {
    const sourceUrl = safePublicHref(citation.sourceUrl);
    return sourceUrl ? [{ ...citation, sourceUrl }] : [];
  });
  if (safeCitations.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {safeCitations.map((c) => {
        const meta = SOURCE_META[c.source];
        const external = c.sourceUrl.startsWith("http");
        const classes = cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
          sourceBadgeClasses[c.source]
        );
        if (!external) {
          return (
            <span key={c.source + c.sourceUrl} className={classes}>
              {meta.displayName}
            </span>
          );
        }
        return (
          <a
            key={c.source + c.sourceUrl}
            href={c.sourceUrl}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className={cn(classes, "transition-opacity hover:opacity-80")}
          >
            {meta.displayName}
            <ExternalLink className="size-2.5" />
          </a>
        );
      })}
    </div>
  );
}

/** Expiry line: rose when expired, amber + "Ends today/tomorrow/in N days" when soon. */
export function ExpiryLine({
  expiryDate,
  expiringSoon,
  expired,
}: {
  expiryDate: string | null;
  expiringSoon?: boolean;
  expired: boolean;
}) {
  const urgency = expiringSoon ? expiryUrgencyLabelAU(expiryDate) : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px]",
        expired
          ? "font-medium text-rose-700 dark:text-rose-400"
          : urgency
            ? "font-medium text-amber-700 dark:text-amber-400"
            : "text-muted-foreground"
      )}
    >
      <Clock className="size-3" />
      {expiryDate
        ? expired
          ? `Expired ${formatDateAU(expiryDate)}`
          : urgency
            ? `${urgency} — ${formatDateAU(expiryDate)}`
            : `Expires ${formatDateAU(expiryDate)}`
        : "Check source for expiry"}
    </span>
  );
}

/** "Last checked" line — when this offer's data was last manually verified. */
export function CheckedLine({ lastCheckedAt }: { lastCheckedAt?: string | null }) {
  const checked = formatDateAU(lastCheckedAt ?? null);
  if (!checked) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <RefreshCw className="size-3" />
      Checked {checked}
    </span>
  );
}
