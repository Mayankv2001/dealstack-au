import {
  AlertTriangle,
  BadgePercent,
  CreditCard,
  Gift,
  Info,
  type LucideIcon,
  Sparkles,
  Star,
  TrendingDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import StoreLogo from "@/components/StoreLogo";
import { CitationLinks, ConfidencePill } from "@/components/WeeklyDealCard";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type {
  StackComponent,
  StackLayer,
  StackRecommendation,
  StackWarningLevel,
} from "@/lib/offers/types";
import { cn } from "@/lib/utils";

/**
 * Displays one StackRecommendation from lib/stack/buildStack.ts: the combined
 * discount + gift card + cashback + points stack, its effective price, total
 * saving, warnings, confidence and source citations.
 *
 * `compact` renders a dense, scannable variant for the "top stacks" strip:
 * store, layer chips, effective price + saving, confidence — and nothing else.
 */

const layerMeta: Record<
  StackLayer,
  { icon: LucideIcon; label: string; tile: string }
> = {
  discount: {
    icon: BadgePercent,
    label: "Discount code",
    tile: "bg-primary/10 text-primary",
  },
  "gift-card": {
    icon: Gift,
    label: "Gift card",
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  cashback: {
    icon: CreditCard,
    label: "Cashback",
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  points: {
    icon: Star,
    label: "Points",
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
};

const warningStyles: Record<
  StackWarningLevel,
  { icon: LucideIcon; className: string }
> = {
  info: {
    icon: Info,
    className: "border-sky-500/25 bg-sky-500/5 text-sky-700 dark:text-sky-400",
  },
  caution: {
    icon: AlertTriangle,
    className:
      "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400",
  },
  risk: {
    icon: AlertTriangle,
    className:
      "border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-400",
  },
};

/** Short chip value per layer for the compact variant. */
function layerChipValue(c: StackComponent): string {
  if (c.layer === "points") {
    return `${(c.pointsEarned ?? 0).toLocaleString("en-AU")} pts`;
  }
  if (typeof c.valuePercent === "number" && c.valuePercent > 0) {
    return `${c.valuePercent}%`;
  }
  return layerMeta[c.layer].label;
}

export function StackRecommendationCard({
  recommendation: rec,
  stores,
  compact = false,
  rank,
}: {
  recommendation: StackRecommendation;
  stores: Store[];
  compact?: boolean;
  rank?: number;
}) {
  const store = stores.find((s) => s.id === rec.merchantId);
  const fallbackText = store
    ? undefined
    : rec.merchantName.slice(0, 2).toUpperCase();

  // ── Compact, scannable variant (top stacks strip) ──────────────────────
  if (compact) {
    const layers = rec.components.filter((c) => !c.optional);
    return (
      <Card className="gap-0 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            {typeof rank === "number" && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-bold text-white">
                {rank}
              </span>
            )}
            <StoreLogo store={store} text={fallbackText} size="xs" />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold">
              {rec.merchantName}
            </p>
            <ConfidencePill confidence={rec.confidence} />
          </div>

          {/* Layer chips */}
          <div className="flex flex-wrap gap-1">
            {layers.map((c, i) => {
              const meta = layerMeta[c.layer];
              return (
                <span
                  key={`${c.layer}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium"
                >
                  <meta.icon className="size-2.5 text-muted-foreground" />
                  {layerChipValue(c)}
                </span>
              );
            })}
          </div>

          {/* Price + saving */}
          <div className="mt-auto flex items-end justify-between gap-2 rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] px-3 py-2">
            <div>
              <p className="text-[10px] text-muted-foreground">Effective</p>
              <p className="text-lg font-bold leading-none tracking-tight text-emerald-700 dark:text-emerald-400">
                {formatAUD(rec.effectivePrice)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground">Save</p>
              <p className="text-sm font-bold leading-tight text-emerald-700 dark:text-emerald-400">
                {formatAUD(rec.totalSaving)}
              </p>
              <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                {rec.effectiveDiscountPercent}% off
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Full variant ───────────────────────────────────────────────────────
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <StoreLogo store={store} text={fallbackText} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">
              {rec.title}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Example spend {formatAUD(rec.basePrice)}
            </p>
          </div>
          <ConfidencePill confidence={rec.confidence} />
        </div>

        {/* Effective price + saving — the headline */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-emerald-500/25 bg-emerald-500/20 dark:bg-emerald-500/15">
          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Effective price
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              {formatAUD(rec.effectivePrice)}
            </p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] p-3 text-right">
            <p className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
              <TrendingDown className="size-3" />
              You save
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              {formatAUD(rec.totalSaving)}
            </p>
            <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
              {rec.effectiveDiscountPercent}% off
            </p>
          </div>
        </div>

        {rec.pointsEarned > 0 && (
          <p className="-mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles className="size-3 text-amber-500" />
            Plus ~{rec.pointsEarned.toLocaleString("en-AU")} points
            {rec.pointsValueDollars > 0 &&
              ` (≈ ${formatAUD(rec.pointsValueDollars)} value, not deducted above)`}
          </p>
        )}

        {/* Stack layers */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            The stack
          </p>
          {rec.components.map((c, i) => {
            const meta = layerMeta[c.layer];
            return (
              <div
                key={`${c.layer}-${i}`}
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-2.5 py-1.5",
                  c.optional
                    ? "border-dashed bg-muted/40 opacity-80"
                    : "bg-card"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
                    meta.tile
                  )}
                >
                  <meta.icon className="size-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {c.label}
                    </span>
                    {c.optional && (
                      <Badge
                        variant="outline"
                        className="shrink-0 px-1 py-0 text-[9px]"
                      >
                        Alternative
                      </Badge>
                    )}
                  </div>
                  {c.note && (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                      {c.note}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {c.layer === "points"
                    ? `${(c.pointsEarned ?? 0).toLocaleString("en-AU")} pts`
                    : c.valueDollars
                      ? `−${formatAUD(c.valueDollars)}`
                      : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Warnings */}
        {rec.warnings.length > 0 && (
          <div className="space-y-1">
            {rec.warnings.map((w, i) => {
              const style = warningStyles[w.level];
              return (
                <p
                  key={`${w.code}-${i}`}
                  className={cn(
                    "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-snug",
                    style.className
                  )}
                >
                  <style.icon className="mt-0.5 size-3 shrink-0" />
                  <span>{w.message}</span>
                </p>
              );
            })}
          </div>
        )}

        {/* Citations */}
        <div className="mt-auto border-t pt-2.5">
          <CitationLinks citations={rec.citations} />
        </div>
      </CardContent>
    </Card>
  );
}

export default StackRecommendationCard;
