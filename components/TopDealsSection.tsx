import { Clock, ExternalLink, Radio } from "lucide-react";
import type { Relevance, TopDeal } from "@/lib/repos/topDealsRanking";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import { cn } from "@/lib/utils";

/**
 * "Today's top OzBargain signals" homepage section.
 *
 * Presentational only — it renders the already-ranked, already-sanitised DTOs
 * produced by lib/repos/topDeals.ts (server-side). No data fetching, no DB, no
 * service-role here. Source links open in a new tab with nofollow/noopener. The
 * parent decides whether to render this at all, so an empty list never reaches
 * it; we still guard defensively.
 */

// Deterministic AU-local timestamp (same input → same output on server+client).
const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatWhen(deal: TopDeal): string {
  const iso = deal.postedAt ?? deal.fetchedAt;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return deal.postedAt ? "Posted recently" : "Checked recently";
  const label = deal.postedAt ? "Posted" : "Checked";
  return `${label} ${DATE_FMT.format(new Date(ms))}`;
}

/** Most recent fetched_at across the shown deals, formatted; null if none parse. */
function formatLastUpdated(deals: TopDeal[]): string | null {
  const latest = deals.reduce((max, d) => {
    const ms = Date.parse(d.fetchedAt);
    return Number.isNaN(ms) ? max : Math.max(max, ms);
  }, 0);
  return latest > 0 ? DATE_FMT.format(new Date(latest)) : null;
}

const RELEVANCE_STYLES: Record<Relevance, string> = {
  high: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  medium: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  low: "border-border bg-muted text-muted-foreground",
};

const RELEVANCE_LABEL: Record<Relevance, string> = {
  high: "High relevance",
  medium: "Worth a look",
  low: "Low relevance",
};

export function TopDealsSection({ deals }: { deals: TopDeal[] }) {
  // No items (or every Top 5 item hidden by an admin — getTopDeals filters
  // those out, yielding []) → hide the whole section rather than show an empty box.
  if (deals.length === 0) return null;

  const lastUpdated = formatLastUpdated(deals);

  return (
    <section
      id="top-deals"
      className="scroll-mt-16 border-t bg-muted/30"
      aria-labelledby="top-deals-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          Community signals
        </p>
        <h2
          id="top-deals-heading"
          className="mt-3 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Today’s top OzBargain signals
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Hand-reviewed picks from OzBargain&rsquo;s RSS feed — every item here
          was checked by an admin first. Verify before buying.
        </p>
        {lastUpdated ? (
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            Last updated {lastUpdated} (Sydney time)
          </p>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <article
              key={deal.id}
              className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm ring-1 ring-foreground/[0.04] transition-all hover:-translate-y-1 hover:shadow-md"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    RELEVANCE_STYLES[deal.relevance]
                  )}
                >
                  <Radio className="size-3" />
                  {RELEVANCE_LABEL[deal.relevance]}
                </span>
                {deal.matchedStoreName ? (
                  <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-foreground">
                    {deal.matchedStoreName}
                  </span>
                ) : null}
              </div>

              <h3 className="mt-3 line-clamp-2 font-semibold leading-snug">
                {deal.title}
              </h3>
              {deal.summary ? (
                <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted-foreground">
                  {deal.summary}
                </p>
              ) : (
                <div className="flex-1" />
              )}

              <div className="mt-4 flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {deal.sourceHost || "source"}
                  </span>
                  {formatWhen(deal)}
                </span>
                {safeHttpsUrl(deal.sourceUrl) ? (
                  <a
                    href={safeHttpsUrl(deal.sourceUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    aria-label={`View “${deal.title}” on OzBargain (opens in a new tab)`}
                  >
                    View on OzBargain
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TopDealsSection;
