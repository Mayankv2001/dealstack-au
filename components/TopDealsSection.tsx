import Link from "next/link";
import { ArrowRight, Clock, ExternalLink, ShieldCheck } from "lucide-react";
import type { TopDeal } from "@/lib/repos/topDealsRanking";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * Compact reviewed-community opportunities for the homepage.
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
  const iso = deal.postedAt;
  if (!iso) return "Posted time unavailable";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "Posted recently";
  return `Posted ${DATE_FMT.format(new Date(ms))}`;
}

export function TopDealsSection({ deals }: { deals: TopDeal[] }) {
  return (
    <section
      id="top-deals"
      className="scroll-mt-20 border-t bg-stone-50/70"
      aria-labelledby="top-deals-heading"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800 dark:text-emerald-300">
          Trending opportunities
        </p>
        <h2
          id="top-deals-heading"
          className="mt-2 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl"
        >
          Reviewed community finds
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Three concise discoveries from approved public signals. Community
          content helps you find an opportunity; it is not counted as a stack layer.
        </p>
        {deals.length ? (
          <div className="mt-7 divide-y rounded-xl border bg-card">
            {deals.map((deal) => (
            <article
              key={deal.id}
              className="grid gap-3 p-4 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:p-5"
            >
              <div>
                <p className="font-semibold">{deal.matchedStoreName ?? "Community find"}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock aria-hidden className="size-3" />{formatWhen(deal)}</p>
              </div>
              <div className="min-w-0">
                <h3 className="line-clamp-1 font-semibold leading-snug">{deal.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{deal.summary || "Reviewed community opportunity. Verify the current price and conditions at the source."}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-800 dark:text-emerald-300"><ShieldCheck aria-hidden className="size-3" /> Admin reviewed</span><span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-medium text-sky-800 dark:text-sky-300">{deal.sourceHost || "Public source"}</span></div>
              </div>
              <div className="sm:text-right">
                {safeHttpsUrl(deal.sourceUrl) ? (
                  <a
                    href={safeHttpsUrl(deal.sourceUrl) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-sky-800 hover:underline dark:text-sky-300"
                    aria-label={`View “${deal.title}” on OzBargain (opens in a new tab)`}
                  >
                    View source
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </article>
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-xl border border-dashed bg-card p-7 text-center">
            <p className="font-semibold">No reviewed community opportunities right now</p>
            <p className="mt-1 text-sm text-muted-foreground">New feed discoveries stay private until an administrator reviews and publishes them.</p>
          </div>
        )}
        <Link href="/deals?view=community" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-emerald-800 hover:underline dark:text-emerald-300">View all community signals <ArrowRight aria-hidden className="size-4" /></Link>
      </div>
    </section>
  );
}

export default TopDealsSection;
