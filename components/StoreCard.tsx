import Link from "next/link";
import { ArrowRight, Clock, CreditCard, Gift, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import StoreLogo from "@/components/StoreLogo";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import { formatExpiry, type Store } from "@/lib/data";
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

export function StoreCard({ store }: { store: Store }) {
  const stack = calculateStack({
    originalPrice: SAMPLE_SPEND,
    discountPercent: store.discountPercent,
    cashbackPercent: store.cashbackPercent,
    giftCardDiscountPercent: store.giftCardDiscountPercent,
  });

  return (
    <Link href={`/stores/${store.id}`} className="group block">
      <Card className="h-full gap-0 py-0 shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:border-emerald-500/50 group-hover:shadow-lg group-hover:shadow-emerald-500/10">
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
                {store.pointsProgram !== "—"
                  ? `${store.pointsProgram} · ${store.pointsRate}`
                  : store.pointsRate}
              </span>
            </SavingRow>
          </div>

          {/* Effective price preview on a sample spend */}
          <div className="rounded-lg border border-emerald-500/25 bg-gradient-to-br from-emerald-500/10 to-emerald-500/[0.03] px-3 py-2 dark:from-emerald-500/15 dark:to-emerald-500/5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Example spend</span>
              <span className="font-medium">{formatAUD(SAMPLE_SPEND)}</span>
            </div>
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
