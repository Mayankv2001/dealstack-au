"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calculator, CreditCard, Gift, Percent, Sparkles, Tag } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { calculateStack, formatAUD } from "@/lib/calculateStack";
import type { StackRecommendation } from "@/lib/offers/types";
import { summariseStackOutcome } from "@/lib/stack/outcome";
import { cn } from "@/lib/utils";

type Mode = "store" | "custom";

export function DealStackCalculator({ recommendations, initialStoreId }: { recommendations: StackRecommendation[]; initialStoreId?: string }) {
  const requested = useSearchParams().get("stack");
  const initialRecommendation =
    recommendations.find((rec) => rec.merchantId === requested) ??
    recommendations.find((rec) => rec.merchantId === initialStoreId) ??
    recommendations[0] ??
    null;
  const [mode, setMode] = useState<Mode>(requested ? "store" : "store");
  const [storeId, setStoreId] = useState(initialRecommendation?.merchantId ?? "");
  const [price, setPrice] = useState("500");
  const [discount, setDiscount] = useState("10");
  const [cashback, setCashback] = useState("6");
  const [giftCard, setGiftCard] = useState("4");
  const [rewardsValue, setRewardsValue] = useState("0");
  const [excludesGiftCard, setExcludesGiftCard] = useState(false);

  const recommendation = recommendations.find((rec) => rec.merchantId === storeId) ?? null;
  const custom = useMemo(() => calculateStack({
    originalPrice: Number(price),
    discountPercent: Number(discount),
    cashbackPercent: Number(cashback),
    giftCardDiscountPercent: Number(giftCard),
    cashbackExcludesGiftCardPayment: excludesGiftCard,
  }), [price, discount, cashback, giftCard, excludesGiftCard]);

  return (
    <Card className="max-w-4xl shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="inline-flex rounded-lg border bg-muted/50 p-1" role="tablist" aria-label="Calculator mode">
          <ModeButton active={mode === "store"} onClick={() => setMode("store")}>Use a store stack</ModeButton>
          <ModeButton active={mode === "custom"} onClick={() => setMode("custom")}>Build a custom stack</ModeButton>
        </div>

        {mode === "store" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
            <div>
              <label htmlFor="calculator-store" className="text-sm font-semibold">Store stack</label>
              <select id="calculator-store" value={storeId} onChange={(event) => setStoreId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm">
                {recommendations.map((rec) => <option key={rec.merchantId} value={rec.merchantId}>{rec.merchantName}</option>)}
              </select>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Uses the current sourced layers and compatibility decisions from the DealStack engine on a {formatAUD(recommendation?.basePrice ?? 500)} example spend.</p>
            </div>
            {recommendation ? <StoreResult recommendation={recommendation} /> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No active sourced stack is available for this store.</div>}
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="original-price" label="Original cart" icon={<Tag aria-hidden className="size-3.5" />} value={price} onChange={setPrice} prefix="$" />
              <Field id="discount-percent" label="Discount code" icon={<Percent aria-hidden className="size-3.5" />} value={discount} onChange={setDiscount} suffix="%" />
              <Field id="gift-card-percent" label="Gift-card discount" icon={<Gift aria-hidden className="size-3.5" />} value={giftCard} onChange={setGiftCard} suffix="%" />
              <Field id="cashback-percent" label="Cashback rate" icon={<CreditCard aria-hidden className="size-3.5" />} value={cashback} onChange={setCashback} suffix="%" />
              <Field id="rewards-value" label="Rewards value" icon={<Sparkles aria-hidden className="size-3.5" />} value={rewardsValue} onChange={setRewardsValue} prefix="$" />
              <label className="flex items-start gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={excludesGiftCard} onChange={(event) => setExcludesGiftCard(event.target.checked)} className="mt-0.5 size-4 accent-emerald-700" /><span><span className="font-medium">Cashback excludes gift-card payment</span><span className="mt-1 block text-xs text-muted-foreground">Use the stronger eligible layer instead of adding both.</span></span></label>
            </div>
            <CustomResult result={custom} rewardsValue={Math.max(0, Number(rewardsValue) || 0)} />
          </div>
        )}

        <details className="mt-6 rounded-lg border bg-muted/30 p-3 text-sm">
          <summary className="cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">How this is calculated</summary>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">The discount code reduces the merchant checkout price first. A discounted gift card reduces the cash needed to fund that checkout. Eligible cashback is calculated on the post-code checkout amount and arrives later. Points and rewards value are shown separately, never subtracted from cash cost. When gift-card payment is excluded, only the stronger eligible layer is counted.</p>
        </details>
      </CardContent>
    </Card>
  );
}

function StoreResult({ recommendation }: { recommendation: StackRecommendation }) {
  const outcome = summariseStackOutcome(recommendation);
  return <ResultPanel original={outcome.originalCart} checkout={outcome.checkoutCost} giftCard={outcome.giftCardSaving} cashback={outcome.cashbackLater} cashPaid={outcome.cashPaidForCheckout} effective={outcome.effectiveFinalCost} rewards={outcome.pointsValueDollars} points={outcome.pointsEarned} warning={recommendation.components.find((component) => component.optional)?.note ?? null} />;
}

function CustomResult({ result, rewardsValue }: { result: ReturnType<typeof calculateStack>; rewardsValue: number }) {
  const warning = result.excludedLayer ? `${result.excludedLayer === "gift-card" ? "Gift-card saving" : "Cashback"} was excluded because the layers were marked incompatible.` : null;
  return <ResultPanel original={result.originalPrice} checkout={result.checkoutPrice} giftCard={result.giftCardSaving} cashback={result.estimatedCashback} cashPaid={result.cashPaidForCheckout} effective={result.finalEffectivePrice} rewards={rewardsValue} points={0} warning={warning} />;
}

function ResultPanel({ original, checkout, giftCard, cashback, cashPaid, effective, rewards, points, warning }: { original: number; checkout: number; giftCard: number; cashback: number; cashPaid: number; effective: number; rewards: number; points: number; warning: string | null }) {
  return <div className="rounded-xl border bg-card p-4 sm:p-5"><div className="flex items-center gap-2"><Calculator aria-hidden className="size-4 text-emerald-800" /><h3 className="font-semibold">Stack result</h3></div><dl className="mt-4 divide-y text-sm"><Row label="Original cart" value={formatAUD(original)} /><Row label="Checkout cost" value={formatAUD(checkout)} /><Row label="Gift-card saving" value={giftCard > 0 ? `−${formatAUD(giftCard)}` : formatAUD(0)} saving={giftCard > 0} /><Row label="Cash paid for checkout" value={formatAUD(cashPaid)} /><Row label="Cashback expected later" value={cashback > 0 ? `−${formatAUD(cashback)}` : formatAUD(0)} saving={cashback > 0} /><Row label="Effective final cost" value={formatAUD(effective)} strong /></dl>{points > 0 || rewards > 0 ? <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm"><p className="font-semibold">Rewards shown separately</p><p className="mt-1 text-xs text-muted-foreground">{points > 0 ? `~${points.toLocaleString("en-AU")} points` : "Custom rewards value"}{rewards > 0 ? ` · estimated ${formatAUD(rewards)} value` : ""}. Not deducted from cash cost.</p></div> : null}{warning ? <p className="mt-3 text-xs leading-relaxed text-amber-900 dark:text-amber-200">{warning}</p> : null}</div>;
}

function Row({ label, value, saving = false, strong = false }: { label: string; value: string; saving?: boolean; strong?: boolean }) { return <div className="flex items-center justify-between gap-4 py-2.5"><dt className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</dt><dd className={strong ? "text-xl font-bold" : saving ? "font-semibold text-emerald-800 dark:text-emerald-300" : "font-medium"}>{value}</dd></div>; }

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>{children}</button>; }

function Field({ id, label, icon, value, onChange, prefix, suffix }: { id: string; label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; prefix?: string; suffix?: string }) { return <div><label htmlFor={id} className="flex items-center gap-1.5 text-sm font-medium">{icon}{label}</label><div className="relative mt-1.5">{prefix ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span> : null}<Input id={id} type="number" inputMode="decimal" min={0} value={value} onChange={(event) => onChange(event.target.value)} className={prefix ? "pl-7" : suffix ? "pr-8" : undefined} />{suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span> : null}</div></div>; }

export default DealStackCalculator;
