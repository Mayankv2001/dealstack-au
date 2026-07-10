import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SignalDealCard from "@/components/SignalDealCard";
import type { Store } from "@/lib/data";
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

export function HotBuys({
  signals,
  stores,
}: {
  signals: OzBargainSignal[];
  stores: Store[];
}) {
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
        {items.map((item) => (
          <SignalDealCard key={item.id} signal={item} stores={stores} />
        ))}
      </div>
    </section>
  );
}

export default HotBuys;
