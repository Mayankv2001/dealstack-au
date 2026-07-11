import {
  AlertTriangle,
  BadgePercent,
  Check,
  CreditCard,
  Gift,
  Info,
  Link2,
  type LucideIcon,
  Shuffle,
  Sparkles,
  Star,
  Store as StoreIcon,
  TrendingDown,
} from "lucide-react";
import Link from "next/link";
import CopyCodeButton from "@/components/CopyCodeButton";
import StackSourceDisclosure from "@/components/StackSourceDisclosure";
import StoreLogo from "@/components/StoreLogo";
import { Card, CardContent } from "@/components/ui/card";
import { formatAUD } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type {
  StackComponent,
  StackLayer,
  StackRecommendation,
  StackWarningLevel,
} from "@/lib/offers/types";
import {
  hasChooseOneLayer,
  layerCompatibility,
  stackTrustStatus,
  type StackTrustTone,
} from "@/lib/stack/present";
import { cn } from "@/lib/utils";

/**
 * Renders one StackRecommendation from the stack engine (lib/stack/buildStack.ts).
 *
 * Outcome-first: the shopper sees the merchant, the saving and the effective
 * price before any code, condition or citation. Cash stacks and points-only
 * rewards opportunities get distinct layouts — a points-only card never shows
 * "0% off". Citations are de-duplicated, warnings are stack-specific, and one
 * trust line replaces the old per-citation "verified" repetition. The card
 * presents the engine's result; it never recomputes savings or compatibility.
 */

const layerMeta: Record<
  StackLayer,
  { icon: LucideIcon; label: string; tile: string; short: string }
> = {
  discount: {
    icon: BadgePercent,
    label: "Discount code",
    tile: "bg-primary/10 text-primary",
    short: "code",
  },
  "gift-card": {
    icon: Gift,
    label: "Gift card",
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    short: "gift card",
  },
  cashback: {
    icon: CreditCard,
    label: "Cashback",
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    short: "cashback",
  },
  points: {
    icon: Star,
    label: "Points",
    tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    short: "points",
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

const trustToneClasses: Record<StackTrustTone, string> = {
  verified:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  checked: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  caution:
    "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400",
};

/** Short chip value per layer, e.g. "10%" or "1,000 pts". */
function layerChipValue(c: StackComponent): string {
  if (c.layer === "points") {
    return `${(c.pointsEarned ?? 0).toLocaleString("en-AU")} pts`;
  }
  if (typeof c.valuePercent === "number" && c.valuePercent > 0) {
    return `${c.valuePercent}%`;
  }
  return layerMeta[c.layer].label;
}

/** One-line plain-English summary of the combinable layers, e.g. "10% code + 6% cashback". */
function layerSummaryLine(rec: StackRecommendation): string {
  const parts = rec.components
    .filter((c) => !c.optional && c.layer !== "points" && (c.valueDollars ?? 0) > 0)
    .map((c) =>
      typeof c.valuePercent === "number" && c.valuePercent > 0
        ? `${c.valuePercent}% ${layerMeta[c.layer].short}`
        : layerMeta[c.layer].short
    );
  return parts.join(" + ");
}

function TrustPill({ rec }: { rec: StackRecommendation }) {
  const status = stackTrustStatus(rec);
  const Icon = status.tone === "caution" ? AlertTriangle : Check;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        trustToneClasses[status.tone]
      )}
    >
      <Icon aria-hidden className="size-3" />
      {status.label}
    </span>
  );
}

function Warnings({ rec }: { rec: StackRecommendation }) {
  if (rec.warnings.length === 0) return null;
  return (
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
            <style.icon aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span>{w.message}</span>
          </p>
        );
      })}
    </div>
  );
}

function LayerList({ rec }: { rec: StackRecommendation }) {
  const combinableCount = rec.components.filter(
    (c) => !c.optional && (c.valueDollars ?? 0) > 0 && c.layer !== "points"
  ).length;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        The stack
      </p>
      {rec.components.map((c, i) => {
        const meta = layerMeta[c.layer];
        const compat = layerCompatibility(c);
        const showCombined =
          compat === "combined" && c.layer !== "points" && combinableCount >= 2;
        return (
          <div
            key={`${c.layer}-${i}`}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-2.5 py-1.5",
              c.optional ? "border-dashed bg-muted/40" : "bg-card"
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
                meta.tile
              )}
            >
              <meta.icon aria-hidden className="size-3" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium">{c.label}</span>
                {compat === "choose-one" ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
                    <Shuffle aria-hidden className="size-2.5" /> Choose one
                  </span>
                ) : showCombined ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
                    <Link2 aria-hidden className="size-2.5" /> Can be combined
                  </span>
                ) : null}
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
      {hasChooseOneLayer(rec) && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          “Choose one” layers cannot be claimed together — pick the stronger option.
        </p>
      )}
    </div>
  );
}

function StackActions({
  rec,
  store,
}: {
  rec: StackRecommendation;
  store: Store | undefined;
}) {
  const codeComponent = rec.components.find((c) => c.code && !c.optional);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {codeComponent?.code && <CopyCodeButton code={codeComponent.code} />}
      <Link
        href={`/stores/${rec.merchantId}`}
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <StoreIcon aria-hidden className="size-3.5" />
        {store ? `${store.name} offers` : "Store offers"}
      </Link>
    </div>
  );
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
  const pointsOnly = rec.kind === "points-only";

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
          </div>
          <div className="flex flex-wrap gap-1">
            {layers.map((c, i) => {
              const meta = layerMeta[c.layer];
              return (
                <span
                  key={`${c.layer}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 text-[10px] font-medium"
                >
                  <meta.icon aria-hidden className="size-2.5 text-muted-foreground" />
                  {layerChipValue(c)}
                </span>
              );
            })}
          </div>
          <div className="mt-auto flex items-end justify-between gap-2 rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] px-3 py-2">
            {pointsOnly ? (
              <div>
                <p className="text-[10px] text-muted-foreground">Cash price</p>
                <p className="text-lg font-bold leading-none tracking-tight text-emerald-700 dark:text-emerald-400">
                  {formatAUD(rec.basePrice)}
                </p>
                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  +{rec.pointsEarned.toLocaleString("en-AU")} pts
                </p>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Points-only rewards opportunity ────────────────────────────────────
  if (pointsOnly) {
    return (
      <Card className="gap-0 py-0 shadow-sm">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            {typeof rank === "number" && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-amber-500 text-[10px] font-bold text-white">
                {rank}
              </span>
            )}
            <StoreLogo store={store} text={fallbackText} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight">
                {rec.merchantName}
              </p>
              <p className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Star aria-hidden className="size-3" /> Earn points
              </p>
            </div>
            <TrustPill rec={rec} />
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-amber-500/[0.03] p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Cash price remains
            </p>
            <p className="mt-0.5 text-xl font-bold tracking-tight">
              {formatAUD(rec.basePrice)}
            </p>
            <p className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <Sparkles aria-hidden className="size-3.5" />
              Earn approximately {rec.pointsEarned.toLocaleString("en-AU")} points
            </p>
            {rec.pointsValueDollars > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Estimated points value: {formatAUD(rec.pointsValueDollars)}
              </p>
            )}
            <p className="mt-1 text-[11px] font-medium text-muted-foreground">
              Points value is not deducted from the cash price.
            </p>
          </div>

          <LayerList rec={rec} />
          <Warnings rec={rec} />

          <div className="mt-auto flex flex-col gap-2.5 border-t pt-2.5">
            <StackActions rec={rec} store={store} />
            <StackSourceDisclosure citations={rec.citations} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Full cash-stack variant — outcome first ────────────────────────────
  const summaryLine = layerSummaryLine(rec);
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          {typeof rank === "number" && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-bold text-white">
              {rank}
            </span>
          )}
          <StoreLogo store={store} text={fallbackText} size="sm" />
          <p className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">
            {rec.merchantName}
          </p>
          <TrustPill rec={rec} />
        </div>

        {/* Outcome headline */}
        <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] p-3">
          <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-400">
            Save {formatAUD(rec.totalSaving)}
            <span className="text-sm font-medium text-muted-foreground">
              {" "}
              on a {formatAUD(rec.basePrice)} example purchase
            </span>
          </p>
          {summaryLine && (
            <p className="mt-0.5 text-xs font-medium text-foreground/80">
              {summaryLine}
            </p>
          )}
          <div className="mt-2 flex items-end justify-between gap-2 border-t border-emerald-500/20 pt-2">
            <div>
              <p className="text-[11px] text-muted-foreground">Effective price</p>
              <p className="text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                {formatAUD(rec.effectivePrice)}
              </p>
            </div>
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              <TrendingDown aria-hidden className="size-3.5" />
              {rec.effectiveDiscountPercent}% total saving
            </p>
          </div>
        </div>

        {rec.pointsEarned > 0 && (
          <p className="-mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Sparkles aria-hidden className="size-3 text-amber-500" />
            Also earn ~{rec.pointsEarned.toLocaleString("en-AU")} points
            {rec.pointsValueDollars > 0 &&
              ` (est. ${formatAUD(rec.pointsValueDollars)} value, not deducted from the cash price)`}
          </p>
        )}

        <LayerList rec={rec} />
        <Warnings rec={rec} />

        <div className="mt-auto flex flex-col gap-2.5 border-t pt-2.5">
          <StackActions rec={rec} store={store} />
          <StackSourceDisclosure citations={rec.citations} />
        </div>
      </CardContent>
    </Card>
  );
}

export default StackRecommendationCard;
