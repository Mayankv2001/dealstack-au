import { CalendarClock, Clock } from "lucide-react";
import { daysUntilExpiryAU, expiryUrgencyLabelAU } from "@/lib/offers/expiry";
import type { PublicDeal } from "@/lib/deals/types";
import { formatDateAU } from "@/lib/sources/normalise";
import { cn } from "@/lib/utils";

/**
 * One consistent freshness line per card: at most one "added/checked" token
 * and one expiry token — replacing the old cards' three competing date rows.
 * Server-safe; `now` is injected by the page for deterministic rendering.
 */

/** "2 h ago" / "3 days ago" / "today" for an ISO timestamp or date. */
export function relativeTimeLabel(
  iso: string | null,
  now: Date,
): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const diffMs = now.getTime() - then;
  if (diffMs < 0) return null;
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days <= 30) return `${days} days ago`;
  return formatDateAU(iso.slice(0, 10));
}

export function freshnessLabel(deal: PublicDeal, now: Date): string | null {
  if (deal.trust === "expired") return "Expired";
  const iso = deal.lastCheckedAt ?? deal.postedAt;
  if (!iso) return "Needs recheck";
  const checked = Date.parse(iso);
  if (Number.isNaN(checked)) return "Needs recheck";
  const ageDays = Math.floor((now.getTime() - checked) / 86_400_000);
  if (ageDays <= 0) return "Checked today";
  if (ageDays <= 7) return "Checked this week";
  return "Needs recheck";
}

export function expiryLabel(deal: PublicDeal, now: Date): string {
  if (!deal.expiryDate) return "Date unknown";
  const days = daysUntilExpiryAU(deal.expiryDate, now);
  if (days != null && days < 0)
    return `Expired ${formatDateAU(deal.expiryDate)}`;
  const urgency = expiryUrgencyLabelAU(deal.expiryDate, now);
  if (urgency) return urgency;
  return `Expires ${formatDateAU(deal.expiryDate)}`;
}

export function DealFreshness({
  deal,
  now,
  className,
}: {
  deal: PublicDeal;
  now: Date;
  className?: string;
}) {
  const freshness = freshnessLabel(deal, now);
  const expiry = expiryLabel(deal, now);
  const days = daysUntilExpiryAU(deal.expiryDate, now);
  const urgent = days != null && days >= 0 && days <= 7;
  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground",
        className,
      )}
    >
      {freshness ? (
        <span className="inline-flex items-center gap-1">
          <CalendarClock aria-hidden className="size-3" />
          {freshness}
        </span>
      ) : null}
      <span
        className={cn(
          "inline-flex items-center gap-1",
          urgent && "font-medium text-amber-700 dark:text-amber-400",
        )}
      >
        <Clock aria-hidden className="size-3" />
        {expiry}
      </span>
    </p>
  );
}
