import {
  AlertTriangle,
  BadgePercent,
  Calculator,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  Gift,
  Info,
  Link2,
  type LucideIcon,
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
import { publicFreshness } from "@/lib/freshness";
import type {
  StackComponent,
  StackLayer,
  StackRecommendation,
  StackWarningLevel,
} from "@/lib/offers/types";
import {
  excludedLayerReason,
  hasChooseOneLayer,
  isVerifiedStackLayer,
  layerCompatibility,
  layerStatusLabel,
  layerUncertaintyDetails,
  recommendationPresentation,
  stackTrustStatus,
  summariseConditions,
  type StackTrustTone,
} from "@/lib/stack/present";
import { formatDateAU } from "@/lib/sources/normalise";
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

function TrustPill({ rec }: { rec: StackRecommendation }) {
  const status = stackTrustStatus(rec);
  const Icon = status.tone === "caution" ? AlertTriangle : Check;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        trustToneClasses[status.tone],
      )}
    >
      <Icon aria-hidden className="size-3" />
      {status.label}
    </span>
  );
}

/**
 * One compact conditions row instead of a stack of warning banners: the most
 * severe condition inline, with the full list one native-disclosure toggle
 * away ("View conditions").
 */
function ConditionsSummary({ rec }: { rec: StackRecommendation }) {
  const summary = summariseConditions(rec);
  if (!summary.lead) return null;
  const style = warningStyles[summary.lead.level];
  if (summary.extraCount === 0) {
    return (
      <p
        className={cn(
          "flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-snug",
          style.className,
        )}
      >
        <style.icon aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span>{summary.lead.message}</span>
      </p>
    );
  }
  return (
    <details
      className={cn("group/conditions rounded-md border", style.className)}
    >
      <summary className="flex cursor-pointer list-none items-start gap-1.5 px-2 py-1 text-[11px] leading-snug focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <style.icon aria-hidden className="mt-0.5 size-3 shrink-0" />
        <span className="flex-1">
          {summary.lead.message}
          <span className="ml-1 font-semibold">
            View {summary.extraCount} more{" "}
            {summary.extraCount === 1 ? "condition" : "conditions"}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className="mt-0.5 size-3 shrink-0 transition-transform group-open/conditions:rotate-180"
        />
      </summary>
      <ul className="space-y-1 border-t border-current/15 px-2 py-1.5">
        {summary.all.slice(1).map((w, i) => (
          <li
            key={`${w.code}-${i}`}
            className="flex items-start gap-1.5 text-[11px] leading-snug"
          >
            <span
              aria-hidden
              className="mt-1.5 size-1 shrink-0 rounded-full bg-current/60"
            />
            {w.message}
          </li>
        ))}
      </ul>
    </details>
  );
}

/** "Checked 25 Jun 2026 · Ends 31 Jul 2026" — the card's currency proof. */
function FreshnessRow({ rec, now }: { rec: StackRecommendation; now: Date }) {
  const freshness = publicFreshness(rec.checkedAsOf, now);
  const ends = formatDateAU(rec.soonestExpiry ?? null);
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <CalendarClock aria-hidden className="size-3" />
        {freshness.label}
        {freshness.checkedDate ? ` · checked ${freshness.checkedDate}` : ""}
      </span>
      <span className="inline-flex items-center gap-1">
        <Info aria-hidden className="size-3" />
        {ends ? `First layer ends ${ends}` : "Date unknown"}
      </span>
    </p>
  );
}

function LayerStatusChip({ component }: { component: StackComponent }) {
  const status = layerStatusLabel(
    component.confidence,
    component.citation.sourceUrl,
  );
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[9px] font-semibold",
        status.tone === "verified"
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      )}
    >
      {status.label}
    </span>
  );
}

function layerDisplayValue(component: StackComponent): string {
  if (component.layer === "points") {
    const points = (component.pointsEarned ?? 0).toLocaleString("en-AU");
    return component.valueDollars
      ? `${points} points · estimated ${formatAUD(component.valueDollars)}`
      : `${points} points`;
  }
  const percent =
    typeof component.valuePercent === "number" && component.valuePercent > 0
      ? `${component.valuePercent}%`
      : null;
  const dollars = component.valueDollars
    ? formatAUD(component.valueDollars)
    : null;
  return [percent, dollars].filter(Boolean).join(" · ") || "Value not recorded";
}

function LayerRow({
  component,
  section,
  combinableCount,
}: {
  component: StackComponent;
  section: "included" | "excluded" | "rewards";
  combinableCount: number;
}) {
  const meta = layerMeta[component.layer];
  const compat = layerCompatibility(component);
  const showCombined =
    section === "included" && compat === "combined" && combinableCount >= 2;
  const uncertainty = layerUncertaintyDetails(component);

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg border px-2.5 py-2",
        section === "excluded" && "border-dashed bg-muted/40",
        section === "rewards" && "border-amber-500/20 bg-amber-500/[0.04]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md",
          meta.tile,
        )}
      >
        <meta.icon aria-hidden className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">{component.label}</span>
          <LayerStatusChip component={component} />
          {section === "excluded" ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
              Not included
            </span>
          ) : section === "rewards" ? (
            <span className="inline-flex shrink-0 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0 text-[9px] font-semibold text-amber-700 dark:text-amber-400">
              Rewards only
            </span>
          ) : showCombined ? (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-semibold text-emerald-700 dark:text-emerald-400">
              <Link2 aria-hidden className="size-2.5" /> Can be combined
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[10px] text-muted-foreground">
          Offer type: {meta.label} · {layerDisplayValue(component)}
        </p>
        {section === "excluded" ? (
          <p className="mt-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
            Not included — {excludedLayerReason(component)}
          </p>
        ) : section === "rewards" ? (
          <>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              Shown separately as estimated rewards value and not deducted from
              cash paid.
            </p>
            {component.optional ? (
              <p className="mt-1 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                Not included — {excludedLayerReason(component)}
              </p>
            ) : null}
          </>
        ) : component.note ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {component.note}
          </p>
        ) : null}
        {uncertainty ? (
          <details className="group/uncertainty mt-1 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer list-none font-medium text-amber-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-amber-400 [&::-webkit-details-marker]:hidden">
              Why this needs checking
            </summary>
            <dl className="mt-1 space-y-1 border-l-2 border-amber-500/25 pl-2 leading-snug">
              <div>
                <dt className="inline font-semibold text-foreground/80">
                  Buy:{" "}
                </dt>
                <dd className="inline">{uncertainty.acquisition}</dd>
              </div>
              <div>
                <dt className="inline font-semibold text-foreground/80">
                  Spend:{" "}
                </dt>
                <dd className="inline">{uncertainty.redemption}</dd>
              </div>
              {uncertainty.warnings.length > 0 ? (
                <div>
                  <dt className="font-semibold text-foreground/80">Check:</dt>
                  <dd>
                    <ul className="list-disc pl-4">
                      {uncertainty.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function LayerList({ rec }: { rec: StackRecommendation }) {
  const included = rec.components.filter(
    (component) => !component.optional && component.layer !== "points",
  );
  const excluded = rec.components.filter(
    (component) => component.optional && component.layer !== "points",
  );
  const rewards = rec.components.filter(
    (component) => component.layer === "points",
  );
  const verifiedIncluded = included.filter(isVerifiedStackLayer).length;
  const combinableCount = included.filter(
    (component) => (component.valueDollars ?? 0) > 0,
  ).length;
  return (
    <div className="space-y-3">
      {included.length > 0 ? (
        <section className="space-y-1.5" aria-label="Included layers">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Included in recommended plan · {verifiedIncluded} of{" "}
            {included.length} verified
          </p>
          {included.map((component, index) => (
            <LayerRow
              key={`included-${component.layer}-${index}`}
              component={component}
              section="included"
              combinableCount={combinableCount}
            />
          ))}
        </section>
      ) : null}

      {excluded.length > 0 ? (
        <section className="space-y-1.5" aria-label="Excluded layers">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Available but not included
          </p>
          {excluded.map((component, index) => (
            <LayerRow
              key={`excluded-${component.layer}-${index}`}
              component={component}
              section="excluded"
              combinableCount={combinableCount}
            />
          ))}
        </section>
      ) : null}

      {rewards.length > 0 ? (
        <section className="space-y-1.5" aria-label="Points and later value">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Points and later value
          </p>
          {rewards.map((component, index) => (
            <LayerRow
              key={`rewards-${component.layer}-${index}`}
              component={component}
              section="rewards"
              combinableCount={combinableCount}
            />
          ))}
        </section>
      ) : null}

      {hasChooseOneLayer(rec) && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          “Choose one” layers cannot be claimed together — pick the stronger
          option.
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
        href={`/?stack=${encodeURIComponent(rec.merchantId)}#calculator`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-emerald-300"
      >
        <Calculator aria-hidden className="size-3.5" />
        Build this stack
      </Link>
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
  now = new Date(),
}: {
  recommendation: StackRecommendation;
  stores: Store[];
  compact?: boolean;
  rank?: number;
  now?: Date;
}) {
  const store = stores.find((s) => s.id === rec.merchantId);
  const fallbackText = store
    ? undefined
    : rec.merchantName.slice(0, 2).toUpperCase();
  const pointsOnly = rec.kind === "points-only";
  const presentation = recommendationPresentation(rec);

  // ── Compact, scannable variant (top stacks strip) ──────────────────────
  if (compact) {
    const layers = rec.components.filter((c) => !c.optional);
    return (
      <Card className="gap-0 py-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/50 hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-2.5 p-3.5">
          <div className="flex items-center gap-2">
            {typeof rank === "number" && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-[10px] font-bold text-white">
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
                  <meta.icon
                    aria-hidden
                    className="size-2.5 text-muted-foreground"
                  />
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
                  <p className="text-[10px] text-muted-foreground">
                    At checkout
                  </p>
                  <p className="text-lg font-bold leading-none tracking-tight text-emerald-700 dark:text-emerald-400">
                    {formatAUD(rec.payAtCheckout)}
                  </p>
                  {rec.cashbackLater > 0 ? (
                    <p className="text-[10px] font-medium text-muted-foreground">
                      +{formatAUD(rec.cashbackLater)} back later
                    </p>
                  ) : null}
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
              <p className="truncate text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Star aria-hidden className="mr-1 inline size-3" />
                {rec.title}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {presentation.recommendationLabel}
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
              Earn approximately {rec.pointsEarned.toLocaleString("en-AU")}{" "}
              points
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
          <ConditionsSummary rec={rec} />

          <div className="mt-auto flex flex-col gap-2.5 border-t pt-2.5">
            <FreshnessRow rec={rec} now={now} />
            <StackActions rec={rec} store={store} />
            <StackSourceDisclosure citations={rec.citations} />
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Full cash-stack variant — outcome first ────────────────────────────
  const fullyVerified = presentation.fullyVerified;
  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardContent className="flex h-full flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          {typeof rank === "number" && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-emerald-700 text-[10px] font-bold text-white">
              {rank}
            </span>
          )}
          <StoreLogo store={store} text={fallbackText} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight">
              {rec.merchantName}
            </p>
            <p className="truncate text-[11px] font-medium text-muted-foreground">
              {rec.title}
            </p>
            <p className="mt-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
              {presentation.recommendationLabel} · {presentation.planLabel}
            </p>
          </div>
          <TrustPill rec={rec} />
        </div>

        {/* Outcome headline — verified saving leads; estimates are labelled. */}
        <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] p-3">
          {fullyVerified ? (
            <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-400">
              You save {formatAUD(rec.verifiedSaving)}
              <span className="text-sm font-medium text-muted-foreground">
                {" "}
                on a {formatAUD(rec.basePrice)} spend
              </span>
            </p>
          ) : rec.verifiedSaving > 0 ? (
            <>
              <p className="text-lg font-bold leading-tight text-emerald-700 dark:text-emerald-400">
                You save {formatAUD(rec.verifiedSaving)}
                <span className="text-sm font-medium text-muted-foreground">
                  {" "}
                  verified, on a {formatAUD(rec.basePrice)} spend
                </span>
              </p>
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Up to {formatAUD(rec.totalSaving)} including unverified layers
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-bold leading-tight text-foreground">
                Up to {formatAUD(rec.totalSaving)} estimated
                <span className="text-sm font-medium text-muted-foreground">
                  {" "}
                  on a {formatAUD(rec.basePrice)} spend
                </span>
              </p>
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                No layer is verified yet — confirm each at its source
              </p>
            </>
          )}
          <div className="mt-2 flex items-end justify-between gap-2 border-t border-emerald-500/20 pt-2">
            <div>
              <p className="text-[11px] text-muted-foreground">
                Pay at checkout
              </p>
              <p className="text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                {formatAUD(rec.payAtCheckout)}
              </p>
              {rec.cashbackLater > 0 ? (
                <p className="text-[11px] font-medium text-muted-foreground">
                  + {formatAUD(rec.cashbackLater)} cashback later ·{" "}
                  {formatAUD(rec.effectivePrice)} effective
                </p>
              ) : null}
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
        <ConditionsSummary rec={rec} />

        <div className="mt-auto flex flex-col gap-2.5 border-t pt-2.5">
          <FreshnessRow rec={rec} now={now} />
          <StackActions rec={rec} store={store} />
          <StackSourceDisclosure citations={rec.citations} />
        </div>
      </CardContent>
    </Card>
  );
}

export default StackRecommendationCard;
