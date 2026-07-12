import Link from "next/link";
import { ArrowRight, Clock, CreditCard, Gift, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StoreLogo from "@/components/StoreLogo";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import { formatExpiry, type Store } from "@/lib/data";
import type { StackRecommendation } from "@/lib/offers/types";
import { formatDateAU } from "@/lib/sources/normalise";
import { cn } from "@/lib/utils";

/** Subtle brand-ish colours per cashback provider, shared with the store detail page */
export const providerBadgeClasses: Record<string, string> = {
  ShopBack:
    "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  TopCashback:
    "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

export const SAMPLE_SPEND = 500;

function SavingRow({
  icon: Icon,
  iconClass,
  children,
}: {
  icon: typeof Gift;
  iconClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md",
          iconClass
        )}
      >
        <Icon className="size-3" />
      </span>
      {children}
    </div>
  );
}

/**
 * "stack" is the minimal homepage card — store name, headline estimated stack
 * percentage and a row of capability badges. "detailed" (the default, used by
 * /search) keeps the full breakdown with code, expiry and effective price.
 */
export function StoreCard({
  store,
  recommendation = null,
  variant = "detailed",
}: {
  store: Store;
  recommendation?: StackRecommendation | null;
  variant?: "detailed" | "stack";
}) {
  const stack = calculateStack({
    originalPrice: SAMPLE_SPEND,
    discountPercent: store.discountPercent,
    cashbackPercent: store.cashbackPercent,
    giftCardDiscountPercent: store.giftCardDiscountPercent,
  });

  const hasPoints = store.pointsProgram !== "—";

  if (variant === "stack") {
    const activeLayers = (recommendation?.components ?? []).filter(
      (component) =>
        !component.optional &&
        (component.layer === "points"
          ? (component.pointsEarned ?? 0) > 0
          : (component.valueDollars ?? 0) > 0)
    );
    const checked = formatDateAU(
      recommendation?.checkedAsOf?.slice(0, 10) ?? null
    );
    const headline = recommendation
      ? recommendation.kind === "points-only"
        ? "Points only"
        : recommendation.totalSaving > 0
          ? `Up to ${recommendation.effectiveDiscountPercent}%`
          : "No active stack found"
      : "Watching for offers";
    return (
      <Link href={`/stores/${store.id}`} className="group block">
        <Card className="h-full rounded-xl py-0 shadow-none transition-colors group-hover:border-emerald-500/60">
          <CardContent className="flex h-full flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <StoreLogo store={store} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold leading-tight">
                  {store.name}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeLayers.length} active {activeLayers.length === 1 ? "layer" : "layers"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Estimated stack
              </p>
              <p
                className={cn(
                  "mt-0.5 font-serif text-2xl font-bold tracking-tight",
                  recommendation?.kind === "cash" && recommendation.totalSaving > 0
                    ? "text-emerald-800 dark:text-emerald-300"
                    : "text-foreground"
                )}
              >
                {headline}
              </p>
            </div>

            <div className="flex min-h-6 flex-wrap gap-1.5">
              {activeLayers.map((component, index) => (
                <span
                  key={`${component.layer}-${index}`}
                  className="rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {component.layer === "discount"
                    ? "Code"
                    : component.layer === "gift-card"
                      ? "Gift card"
                      : component.layer === "cashback"
                        ? "Cashback"
                        : "Points"}
                </span>
              ))}
            </div>
            <p className="mt-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock aria-hidden className="size-3" />
              {checked ? `Checked ${checked}` : "No checked time available"}
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 group-hover:underline dark:text-emerald-300">
              View stack <ArrowRight aria-hidden className="size-3.5" />
            </span>
          </CardContent>
        </Card>
      </Link>
    );
  }

  return (
    <Link href={`/stores/${store.id}`} className="group block">
      <Card className="h-full gap-0 rounded-2xl py-0 shadow-sm ring-foreground/[0.08] transition-all duration-200 group-hover:-translate-y-1 group-hover:ring-emerald-500/50 group-hover:shadow-lg group-hover:shadow-emerald-500/10">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            <StoreLogo store={store} size="sm" />
            <div className="min-w-0">
              <p className="truncate font-semibold leading-tight">
                {store.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {store.category}
              </p>
            </div>
          </div>

          {/* Headline saving: the discount code */}
          {store.discountPercent > 0 ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-1.5">
              <span className="text-sm font-bold text-primary">
                {store.discountPercent}% OFF
              </span>
              <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs font-semibold">
                {store.discountCode}
              </code>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground">
              {store.discountCode}
            </div>
          )}
          <p className="-mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            {formatExpiry(store.expiryDate)}
          </p>

          <div className="space-y-1.5">
            <SavingRow
              icon={CreditCard}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              {store.cashbackPercent > 0 ? (
                <>
                  <span className="shrink-0 font-medium text-emerald-700 dark:text-emerald-400">
                    {store.cashbackPercent}% cashback
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "ml-auto shrink-0 px-1.5 py-0 text-[10px]",
                      providerBadgeClasses[store.cashbackProvider]
                    )}
                  >
                    {store.cashbackProvider}
                  </Badge>
                </>
              ) : (
                <span className="text-muted-foreground">
                  No cashback available
                </span>
              )}
            </SavingRow>
            <SavingRow
              icon={Gift}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {store.giftCardDiscountPercent > 0
                  ? `${store.giftCardDiscountPercent}% off gift cards · ${store.giftCardSource}`
                  : store.giftCardSource}
              </span>
            </SavingRow>
            <SavingRow
              icon={Star}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {hasPoints
                  ? `${store.pointsProgram} · ${store.pointsRate}`
                  : store.pointsRate}
              </span>
            </SavingRow>
          </div>

          {/* Estimated stack value on a $500 spend (customise in the calculator) */}
          <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] px-3 py-2 dark:from-emerald-500/15 dark:to-emerald-500/5">
            <p className="text-[11px] text-muted-foreground">
              On a {formatAUD(SAMPLE_SPEND)} spend
            </p>
            <div className="mt-0.5 flex items-center justify-between">
              <span className="text-xs font-medium">Effective price</span>
              <span className="text-base font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
                {formatAUD(stack.finalEffectivePrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Estimated saving</span>
              <span className="font-bold text-emerald-700 dark:text-emerald-400">
                {formatAUD(stack.totalSaving)} · {stack.totalSavingPercent}%
              </span>
            </div>
          </div>

          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "mt-auto w-full group-hover:border-emerald-600 group-hover:bg-emerald-600 group-hover:text-white"
            )}
          >
            View stack
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default StoreCard;
