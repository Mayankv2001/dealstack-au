import Link from "next/link";
import {
  ArrowRight,
  Clock,
  ExternalLink,
  MessageSquareText,
} from "lucide-react";
import type { TopDeal } from "@/lib/repos/topDealsRanking";
import { safePublicSourceUrl } from "@/lib/security/urlPolicy";

const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function capturedWhen(deal: TopDeal): string {
  const ms = Date.parse(deal.fetchedAt);
  return Number.isNaN(ms)
    ? "Capture time unavailable"
    : `Captured ${DATE_FMT.format(new Date(ms))}`;
}

function initials(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/** Scan-first homepage feed: dense enough for bargain hunters, but every row
 * still distinguishes a community discovery signal from DealStack evidence. */
export function TopDealsSection({ deals }: { deals: TopDeal[] }) {
  return (
    <section
      id="top-deals"
      className="scroll-mt-24 border-y bg-card"
      aria-labelledby="top-deals-heading"
    >
      <div className="page-container py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Fresh, reviewed signals</p>
            <h2
              id="top-deals-heading"
              className="mt-2 text-2xl font-black tracking-tight"
            >
              Worth checking today
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Fast discovery from approved community signals. Popularity does
              not prove compatibility.
            </p>
          </div>
          <Link
            href="/deals"
            className="inline-flex items-center gap-1 text-sm font-bold text-emerald-800 hover:underline dark:text-emerald-300"
          >
            Browse all deals <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>

        {deals.length ? (
          <div className="mt-5 divide-y border-y">
            {deals.map((deal) => {
              const merchant = deal.matchedStoreName ?? "Community find";
              const source = safePublicSourceUrl(deal.sourceUrl);
              const planHref = deal.matchedStoreName
                ? `/search?q=${encodeURIComponent(deal.matchedStoreName)}&spend=500`
                : "/search";
              return (
                <article
                  key={deal.id}
                  className="grid gap-3 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-center"
                >
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-lg border bg-background text-[11px] font-black"
                  >
                    {initials(merchant)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-xs font-bold text-muted-foreground">
                        {merchant}
                      </p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                        Community signal
                      </span>
                    </div>
                    <h3 className="mt-0.5 line-clamp-2 font-semibold leading-snug">
                      {deal.title}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden className="size-3" />
                        {capturedWhen(deal)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquareText aria-hidden className="size-3" />
                        Discussion remains at {deal.sourceHost || "source"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:justify-end">
                    {source ? (
                      <a
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-semibold hover:bg-muted"
                      >
                        View details{" "}
                        <ExternalLink aria-hidden className="size-3" />
                      </a>
                    ) : null}
                    <Link
                      href={planHref}
                      className="inline-flex h-8 items-center rounded-lg bg-emerald-700 px-2.5 text-xs font-semibold text-white hover:bg-emerald-800"
                    >
                      Use in a plan
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 border-y py-6 text-sm text-muted-foreground">
            No community signal is approved for this feed right now. Current
            verified offers remain available under Deals.
          </div>
        )}
      </div>
    </section>
  );
}

export default TopDealsSection;
