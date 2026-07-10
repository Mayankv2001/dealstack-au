import { Sparkles, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import SignalDealCard from "@/components/SignalDealCard";
import StackRecommendationCard from "@/components/StackRecommendationCard";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { SmartStackResult } from "@/lib/stack/smartStack";

/**
 * Renders one Smart Stack result: a community price signal as the base, with the
 * existing receipt/waterfall StackRecommendationCard showing the synthesised
 * stack (gift card + cashback + points) for that store.
 *
 * When the signal's store has no stackable layer (e.g. Costco Hot Buys), there
 * is no receipt to show — but the deal should still surface in search, so it
 * falls back to a compact SignalDealCard instead of disappearing.
 */
export function SmartStackResultCard({
  result,
  stores,
}: {
  result: SmartStackResult;
  stores: Store[];
}) {
  const { signal, recommendation, signalPrice } = result;
  if (!recommendation) return <SignalDealCard signal={signal} stores={stores} />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2">
        <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="min-w-0 flex-1 text-sm font-medium">{signal.title}</span>
        {signal.priceText ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <Tag className="size-3" />
            {signal.priceText}
          </Badge>
        ) : null}
        <span className="basis-full text-xs text-muted-foreground">
          Base{" "}
          {signalPrice
            ? formatAUD(signalPrice)
            : "estimate"}{" "}
          from a checked signal → stacked with the best gift card and cashback
          for {recommendation.merchantName} below.
        </span>
      </div>
      <StackRecommendationCard recommendation={recommendation} stores={stores} />
    </div>
  );
}

export default SmartStackResultCard;
