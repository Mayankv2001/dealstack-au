import { CalendarClock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidencePill } from "@/components/WeeklyDealCard";
import type { Store } from "@/lib/data";
import { expiryUrgencyLabelAU, isPastExpiry, todayAU } from "@/lib/offers/expiry";
import { formatDateAU } from "@/lib/sources/normalise";
import type { OzBargainSignal } from "@/lib/offers/types";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";

/**
 * One approved signal rendered as a compact "deal" card — used for Hot Buys
 * (Costco + OzBargain) and for search matches whose store has no stackable
 * offer (e.g. Costco), so they still surface prominently. Shows a source label,
 * price, summary, expiry, and either a live "View signal" link or a muted
 * "Sample listing" label (sample rows carry placeholder URLs and are never
 * linked as live posts).
 */

/** Human source label for a signal (store name, or OzBargain). */
function sourceLabel(signal: OzBargainSignal, stores: Store[]): string {
  const store = stores.find((s) => s.id === signal.merchantId);
  return store?.name ?? "OzBargain";
}

export function SignalDealCard({
  signal,
  stores,
}: {
  signal: OzBargainSignal;
  stores: Store[];
}) {
  const expiry = formatDateAU(signal.expiryDate ?? null);
  const expired = isPastExpiry(signal.expiryDate, todayAU());
  const urgency = expired ? null : expiryUrgencyLabelAU(signal.expiryDate);
  const isCostco = signal.merchantId === "costco";
  const sourceHref = safeHttpsUrl(signal.sourceUrl);

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={
              isCostco
                ? "border-[#005daa]/30 bg-[#005daa]/10 text-[10px] font-medium text-[#005daa] dark:text-sky-300"
                : "text-[10px] font-medium"
            }
          >
            {sourceLabel(signal, stores)}
          </Badge>
          <ConfidencePill confidence={signal.confidence} />
        </div>

        <p className="text-sm font-semibold leading-snug">{signal.title}</p>

        {signal.priceText ? (
          <p className="text-base font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            {signal.priceText}
          </p>
        ) : null}

        <p className="text-xs leading-relaxed text-muted-foreground">
          {signal.summary}
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
          {expiry ? (
            <span
              className={
                expired
                  ? "inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400"
                  : urgency
                    ? "inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"
                    : "inline-flex items-center gap-1"
              }
            >
              <CalendarClock className="size-3" />
              {expired
                ? `Ended ${expiry}`
                : urgency
                  ? `${urgency} — ${expiry}`
                  : `Ends ${expiry}`}
            </span>
          ) : null}
          {signal.isSample || !sourceHref ? (
            <span className="text-muted-foreground/80">
              {signal.isSample ? "Sample listing" : "Source unavailable"}
            </span>
          ) : (
            <a
              href={sourceHref}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              View signal <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SignalDealCard;
