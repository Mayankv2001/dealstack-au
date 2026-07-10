"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SAMPLE_SPEND } from "@/components/StoreCard";
import { formatAUD, type StackResult } from "@/lib/calculateStack";
import type { Store } from "@/lib/data";
import type { FeaturedStack } from "@/components/home/featured";
import { cn } from "@/lib/utils";

/**
 * Worked $500 deal-stack example — self-contained island whose only state is
 * the waterfall/receipt view toggle. Extracted from HomeClient.
 */

export function WorkedExample({ featured }: { featured: FeaturedStack | null }) {
  const [exampleView, setExampleView] = useState<"waterfall" | "receipt">(
    "waterfall"
  );

  if (!featured) return null;

  return (
    <section id="example" className="scroll-mt-16 border-y bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              A worked example
            </p>
            <h2 className="mt-3 max-w-2xl font-serif text-3xl font-bold tracking-tight sm:text-4xl">
              A {formatAUD(SAMPLE_SPEND)} cart, stacked down to{" "}
              {formatAUD(featured.stack.finalEffectivePrice)}
            </h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Same cart, every layer applied in order. Here’s exactly how
              the effective cost comes down.
            </p>
          </div>
          <div className="inline-flex rounded-full bg-muted p-1 text-sm font-medium">
            <button
              type="button"
              onClick={() => setExampleView("waterfall")}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors",
                exampleView === "waterfall"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Waterfall
            </button>
            <button
              type="button"
              onClick={() => setExampleView("receipt")}
              className={cn(
                "rounded-full px-4 py-1.5 transition-colors",
                exampleView === "receipt"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Receipt
            </button>
          </div>
        </div>

        <Card className="mt-8 rounded-3xl shadow-xl shadow-emerald-900/[0.06]">
          <CardContent className="p-6 sm:p-8">
            {exampleView === "waterfall" ? (
              <WaterfallView store={featured.store} stack={featured.stack} />
            ) : (
              <ReceiptView store={featured.store} stack={featured.stack} />
            )}

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-dashed pt-6">
              <div>
                <p className="text-sm text-muted-foreground">
                  Effective cost
                </p>
                <p className="font-serif text-4xl font-bold tracking-tight">
                  {formatAUD(featured.stack.finalEffectivePrice)}{" "}
                  <span className="text-lg font-medium text-muted-foreground line-through">
                    {formatAUD(SAMPLE_SPEND)}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 px-5 py-3 text-right">
                <p className="font-serif text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatAUD(featured.stack.totalSaving)}
                  <span className="ml-1.5 text-sm font-medium">saved</span>
                </p>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  {featured.stack.totalSavingPercent}% off
                </p>
              </div>
            </div>

            {featured.store.pointsProgram !== "—" && (
              <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="size-3.5 text-amber-500" />
                Plus {featured.store.pointsProgram} points on top (
                {featured.store.pointsRate}) — bonus value not counted
                above.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/** Ordered savings steps shared by the waterfall and receipt views. */
function buildSteps(store: Store, stack: StackResult) {
  const steps: {
    key: string;
    label: string;
    sub: string;
    amount: number | null;
    running: number;
    barClass: string;
    amountClass: string;
  }[] = [
    {
      key: "cart",
      label: "Cart total",
      sub: "what you’d normally pay",
      amount: null,
      running: stack.originalPrice,
      barClass: "bg-muted text-foreground",
      amountClass: "text-foreground",
    },
  ];
  let running = stack.originalPrice;
  if (stack.discountSaving > 0) {
    running -= stack.discountSaving;
    steps.push({
      key: "discount",
      label: "Discount code",
      sub: `${store.discountPercent}% off at checkout`,
      amount: stack.discountSaving,
      running,
      barClass: "bg-primary text-primary-foreground",
      amountClass: "text-primary",
    });
  }
  if (stack.giftCardSaving > 0) {
    running -= stack.giftCardSaving;
    steps.push({
      key: "giftcard",
      label: "Discounted gift card",
      sub: `bought at ${store.giftCardDiscountPercent}% off face value`,
      amount: stack.giftCardSaving,
      running,
      barClass: "bg-sky-700 text-white",
      amountClass: "text-sky-700 dark:text-sky-400",
    });
  }
  if (stack.estimatedCashback > 0) {
    running -= stack.estimatedCashback;
    steps.push({
      key: "cashback",
      label: "Cashback",
      sub: `${store.cashbackPercent}% confirmed after purchase`,
      amount: stack.estimatedCashback,
      running,
      barClass: "bg-emerald-600 text-white",
      amountClass: "text-emerald-700 dark:text-emerald-400",
    });
  }
  return steps;
}

/** Per-layer running-total waterfall bars. */
function WaterfallView({ store, stack }: { store: Store; stack: StackResult }) {
  const steps = buildSteps(store, stack);
  return (
    <div className="space-y-5">
      {steps.map((step) => (
        <div key={step.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-semibold">{step.label}</span>
              <span className="truncate text-xs text-muted-foreground">
                {step.sub}
              </span>
            </span>
            <span className={cn("shrink-0 font-medium tabular-nums", step.amountClass)}>
              {step.amount === null
                ? formatAUD(step.running)
                : `− ${formatAUD(step.amount)}`}
            </span>
          </div>
          <div className="mt-2 h-9 overflow-hidden rounded-lg bg-muted/50">
            <div
              className={cn(
                "flex h-full items-center justify-end rounded-lg px-3",
                step.barClass
              )}
              style={{ width: `${(step.running / stack.originalPrice) * 100}%` }}
            >
              <span className="text-xs font-semibold tabular-nums">
                {formatAUD(step.running)}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Itemised receipt of the same stack. */
function ReceiptView({ store, stack }: { store: Store; stack: StackResult }) {
  return (
    <dl className="space-y-3 text-sm">
      <ReceiptRow label="Cart total" value={formatAUD(stack.originalPrice)} />
      {stack.discountSaving > 0 && (
        <ReceiptRow
          label={`Discount code · ${store.discountPercent}%`}
          value={`− ${formatAUD(stack.discountSaving)}`}
          credit
        />
      )}
      <ReceiptRow
        label="Checkout price"
        value={formatAUD(stack.checkoutPrice)}
      />
      {stack.giftCardSaving > 0 && (
        <ReceiptRow
          label={`Discounted gift card · ${store.giftCardDiscountPercent}%`}
          value={`− ${formatAUD(stack.giftCardSaving)}`}
          credit
        />
      )}
      {stack.estimatedCashback > 0 && (
        <ReceiptRow
          label={`Cashback · ${store.cashbackPercent}%`}
          value={`− ${formatAUD(stack.estimatedCashback)}`}
          credit
        />
      )}
    </dl>
  );
}

function ReceiptRow({
  label,
  value,
  credit,
}: {
  label: string;
  value: string;
  credit?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-dashed pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-medium tabular-nums",
          credit ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export default WorkedExample;
