import { CalendarClock, ExternalLink, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidencePill } from "@/components/WeeklyDealCard";
import { formatDateAU } from "@/lib/sources/normalise";
import type { OzBargainSignal } from "@/lib/offers/types";

/**
 * Public "Costco Hot Buys" section.
 *
 * Displays ONLY admin-approved signals tagged for Costco. The data is handed in
 * from the page's repo load (`getOzBargainSignals`/`loadStackData`), which under
 * RLS returns `status = 'approved'` rows only — so nothing un-reviewed can ever
 * appear here. There is no fetching, no scraping, and no auto-publish: items
 * reach this surface only after an admin approves them (or as curated samples).
 */

const COSTCO_TAGS = new Set(["costco", "hot-buys"]);

/** Approved Costco-tagged signals (defensive status filter + tag/merchant match). */
export function selectCostcoHotBuys(
  signals: OzBargainSignal[]
): OzBargainSignal[] {
  return signals.filter(
    (s) =>
      (s.status ?? "approved") === "approved" &&
      (s.merchantId === "costco" ||
        (s.tags ?? []).some((t) => COSTCO_TAGS.has(t.toLowerCase())))
  );
}

export function CostcoHotBuys({ signals }: { signals: OzBargainSignal[] }) {
  const items = selectCostcoHotBuys(signals);
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/15 to-rose-500/10">
          <Flame className="size-4 text-amber-600 dark:text-amber-400" />
        </span>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">
          Costco Hot Buys
        </h2>
        <Badge variant="outline" className="text-[10px] font-medium">
          Admin-approved
        </Badge>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Approved member-pricing signals for Costco AU. Stock and prices vary by
        warehouse — always confirm before travelling.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const expiry = formatDateAU(item.expiryDate ?? null);
          return (
            <Card key={item.id} className="gap-0 py-0 shadow-sm">
              <CardContent className="flex h-full flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold leading-snug">
                    {item.title}
                  </p>
                  <ConfidencePill confidence={item.confidence} />
                </div>

                {item.priceText ? (
                  <p className="text-base font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                    {item.priceText}
                  </p>
                ) : null}

                <p className="text-xs leading-relaxed text-muted-foreground">
                  {item.summary}
                </p>

                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
                  {expiry ? (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3" />
                      Ends {expiry}
                    </span>
                  ) : null}
                  {/* Sample rows use placeholder node URLs — never rendered as a
                      live link (matches the rest of the sample-signal UI). */}
                  {item.isSample ? (
                    <span className="text-muted-foreground/80">
                      Sample listing
                    </span>
                  ) : (
                    <a
                      href={item.sourceUrl}
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
        })}
      </div>
    </section>
  );
}

export default CostcoHotBuys;
