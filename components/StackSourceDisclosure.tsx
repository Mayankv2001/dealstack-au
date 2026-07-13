import { ChevronDown, ExternalLink } from "lucide-react";
import {
  MAX_VISIBLE_SOURCES,
  summariseCitations,
  type CitationProvider,
} from "@/lib/stack/citationSummary";
import type { Citation, SourceId } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

/**
 * Collapsed source summary for a stack card.
 *
 * Shows at most three de-duplicated source badges plus an "N sources checked"
 * count, and reveals the complete, traceable citation list inside a native
 * <details> disclosure (keyboard- and screen-reader-accessible, no JS). This
 * replaces the wall of repeated "OzBargain" badges while keeping every source
 * one interaction away.
 */

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

function ProviderBadge({ provider }: { provider: CitationProvider }) {
  const classes = cn(
    "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
    sourceBadgeClasses[provider.source]
  );
  const label =
    provider.count > 1 ? `${provider.displayName} ×${provider.count}` : provider.displayName;
  return <span className={classes}>{label}</span>;
}

export function StackSourceDisclosure({
  citations,
  className,
}: {
  citations: Citation[];
  className?: string;
}) {
  const summary = summariseCitations(citations, MAX_VISIBLE_SOURCES);
  if (summary.total === 0) return null;

  const linkLabel = `${summary.total} ${summary.total === 1 ? "source link" : "source links"}`;
  const familyLabel = `${summary.publisherFamilyCount} independent ${
    summary.publisherFamilyCount === 1 ? "publisher family" : "publisher families"
  }`;
  const countLabel = `${linkLabel} across ${familyLabel}`;

  return (
    <details className={cn("group/sources", className)}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1.5 rounded-md text-[11px] text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-foreground/80">{countLabel}</span>
        <span aria-hidden className="text-muted-foreground/50">·</span>
        {summary.visibleProviders.map((p) => (
          <ProviderBadge key={p.source} provider={p} />
        ))}
        {summary.hiddenProviderCount > 0 && (
          <span className="inline-flex items-center rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            +{summary.hiddenProviderCount}
          </span>
        )}
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open/sources:rotate-180"
        />
        <span className="sr-only">Show all sources</span>
      </summary>
      <ul className="mt-2 space-y-1 border-l-2 pl-3">
        {summary.all.map((entry, i) => (
          <li key={`${entry.source}-${i}`} className="text-[11px]">
            {entry.href ? (
              <a
                href={entry.href}
                target={entry.href.startsWith("http") ? "_blank" : undefined}
                rel={
                  entry.href.startsWith("http")
                    ? "nofollow noopener noreferrer"
                    : undefined
                }
                className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground hover:underline"
              >
                {entry.displayName}
                {entry.href.startsWith("http") && (
                  <ExternalLink aria-hidden className="size-2.5" />
                )}
              </a>
            ) : (
              <span className="text-muted-foreground">
                {entry.displayName}
                <span className="ml-1 text-muted-foreground/70">
                  (no public link)
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default StackSourceDisclosure;
