import { CalendarClock, ExternalLink, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ConfidencePill } from "@/components/WeeklyDealCard";
import { stores } from "@/lib/data";
import { formatDateAU } from "@/lib/sources/normalise";
import type { OzBargainSignal } from "@/lib/offers/types";

/**
 * Public "Hot Buys" section — Costco + OzBargain.
 *
 * Shows ONLY admin-approved hot-buy signals: a Costco-tagged signal, or any
 * signal tagged `hot-buys`. The data comes from the page's repo load, which
 * under RLS returns `status = 'approved'` rows only — so nothing un-reviewed
 * ever appears here (a defensive status filter is applied on top). No fetching,
 * no scraping, no auto-publish: items reach this surface only after approval
 * (or as curated samples that are pre-approved). Curated/approved hot buys flow
 * to the page automatically; the review gate still guards raw feed data.
 */

const HOT_BUYS_TAG = "hot-buys";

/** Approved hot-buy signals: Costco, or anything tagged `hot-buys`. */
export function selectHotBuys(signals: OzBargainSignal[]): OzBargainSignal[] {
  return signals
    .filter(
      (s) =>
        (s.status ?? "approved") === "approved" &&
        (s.merchantId === "costco" ||
          (s.tags ?? []).some((t) => t.toLowerCase() === HOT_BUYS_TAG))
    )
    .sort((a, b) => (b.signalScore ?? 0) - (a.signalScore ?? 0));
}

/** Human source label for a hot-buy card (store name, or OzBargain). */
function sourceLabel(signal: OzBargainSignal): string {
  const store = stores.find((s) => s.id === signal.merchantId);
  return store?.name ?? "OzBargain";
}

export function HotBuys({ signals }: { signals: OzBargainSignal[] }) {
  const items = selectHotBuys(signals);
  if (items.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/15 to-rose-500/10">
          <Flame className="size-4 text-amber-600 dark:text-amber-400" />
        </span>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">Hot Buys</h2>
        <Badge variant="outline" className="text-[10px] font-medium">
          Admin-approved
        </Badge>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Approved Costco member-pricing and OzBargain hot buys. Stock and prices
        change fast — always confirm at the source before buying.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const expiry = formatDateAU(item.expiryDate ?? null);
          const isCostco = item.merchantId === "costco";
          return (
            <Card key={item.id} className="gap-0 py-0 shadow-sm">
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
                    {sourceLabel(item)}
                  </Badge>
                  <ConfidencePill confidence={item.confidence} />
                </div>

                <p className="text-sm font-semibold leading-snug">
                  {item.title}
                </p>

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

export default HotBuys;
