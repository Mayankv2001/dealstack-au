import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  X as XIcon,
} from "lucide-react";
import {
  LAYER_STATE_LABEL,
  type LayerState,
  type MerchantLayerFact,
  type MerchantStackFacts,
} from "@/lib/deals/merchantFacts";

/**
 * Real per-merchant layer states from the stack engine — replaces the old
 * hard-coded "Compatibility: unknown" line. Chips summarise each layer with
 * one of four explicit states; a native disclosure exposes every
 * non-"works" reason in place, without a trip to the planner.
 */

const LAYER_STATE_STYLE: Record<LayerState, string> = {
  works:
    "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  conditional:
    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "no-stack":
    "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-300",
  "insufficient-evidence": "border bg-muted text-muted-foreground",
};

const LAYER_STATE_ICON: Record<LayerState, typeof Check> = {
  works: Check,
  conditional: AlertTriangle,
  "no-stack": XIcon,
  "insufficient-evidence": CircleHelp,
};

export function layerEntries(
  facts: MerchantStackFacts,
): Array<{ key: string; fact: MerchantLayerFact }> {
  return [
    facts.coupon ? { key: "coupon", fact: facts.coupon } : null,
    facts.giftCard ? { key: "gift-card", fact: facts.giftCard } : null,
    facts.cashback ? { key: "cashback", fact: facts.cashback } : null,
    facts.points ? { key: "points", fact: facts.points } : null,
  ].filter(
    (entry): entry is { key: string; fact: MerchantLayerFact } => entry != null,
  );
}

export function LayerFactChips({ facts }: { facts: MerchantStackFacts }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {layerEntries(facts).map(({ key, fact }) => {
        const Icon = LAYER_STATE_ICON[fact.state];
        return (
          <span
            key={key}
            className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${LAYER_STATE_STYLE[fact.state]}`}
          >
            <Icon aria-hidden className="size-2.5" />
            {fact.label} · {LAYER_STATE_LABEL[fact.state]}
          </span>
        );
      })}
    </div>
  );
}

export function LayerFactsLine({
  facts,
}: {
  facts: MerchantStackFacts | null;
}) {
  const entries = facts ? layerEntries(facts) : [];
  if (!facts || entries.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <CircleHelp aria-hidden className="size-3" /> No saving layers on file
        for this merchant
      </span>
    );
  }
  const explained = entries.filter(({ fact }) => fact.reason);
  return (
    <div className="min-w-0">
      <LayerFactChips facts={facts} />
      {explained.length > 0 ? (
        <details className="group/facts mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            Conditions
            <ChevronDown
              aria-hidden
              className="size-3 transition-transform group-open/facts:rotate-180"
            />
          </summary>
          <ul className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground">
            {explained.map(({ key, fact }) => (
              <li key={key}>
                <span className="font-medium text-foreground">
                  {fact.label}:
                </span>{" "}
                {fact.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export default LayerFactsLine;
