"use client";

import { useState } from "react";
import { formatAUD } from "@/lib/calculateStack";

function NumberField({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      {label}
      <span className="flex h-10 items-center rounded-lg border bg-background px-3 text-sm text-foreground">
        <input type="number" min={0} step={0.1} value={value} onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))} className="min-w-0 flex-1 bg-transparent outline-none" />
        <span className="text-muted-foreground">{suffix}</span>
      </span>
    </label>
  );
}

export function SavingsValueComparison() {
  const [spend, setSpend] = useState(500);
  const [giftRate, setGiftRate] = useState(10);
  const [cashbackRate, setCashbackRate] = useState(8);
  const [pointsMultiple, setPointsMultiple] = useState(20);
  const [pointValue, setPointValue] = useState(0.5);
  const [promo, setPromo] = useState(50);

  const gift = spend * giftRate / 100;
  const cashback = spend * cashbackRate / 100;
  const points = spend * pointsMultiple;
  const pointsValue = points * pointValue / 100;
  const rows = [
    [`${giftRate}% gift-card discount`, gift, 0, gift],
    [`${cashbackRate}% cashback`, 0, cashback, cashback],
    [`${pointsMultiple}× points`, 0, pointsValue, pointsValue],
    [`${formatAUD(promo)} promo code`, Math.min(promo, spend), 0, Math.min(promo, spend)],
  ] as const;

  return (
    <section className="mt-10 border-y py-8" aria-labelledby="value-comparison-heading">
      <p className="eyebrow">Value comparison tool</p>
      <h2 id="value-comparison-heading" className="mt-2 text-2xl font-black tracking-tight">Compare cash now with value later</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">These are editable examples, not current offers. Delayed cashback and estimated points value are not equivalent to an immediate checkout saving.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <NumberField label="Spend" value={spend} onChange={setSpend} suffix="AUD" />
        <NumberField label="Gift-card discount" value={giftRate} onChange={setGiftRate} suffix="%" />
        <NumberField label="Cashback" value={cashbackRate} onChange={setCashbackRate} suffix="%" />
        <NumberField label="Points per $1" value={pointsMultiple} onChange={setPointsMultiple} suffix="×" />
        <NumberField label="Point value" value={pointValue} onChange={setPointValue} suffix="¢" />
        <NumberField label="Promo code" value={promo} onChange={setPromo} suffix="$" />
      </div>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
          <thead className="border-y bg-muted/50 text-xs text-muted-foreground">
            <tr><th className="px-3 py-2 font-semibold">Option</th><th className="px-3 py-2 font-semibold">Checkout saving</th><th className="px-3 py-2 font-semibold">Later / estimated value</th><th className="px-3 py-2 font-semibold">Estimated total</th></tr>
          </thead>
          <tbody className="divide-y">
            {rows.map(([label, immediate, later, total]) => (
              <tr key={label}><th className="px-3 py-3 font-semibold">{label}</th><td className="px-3 py-3 tabular-nums">{formatAUD(immediate)}</td><td className="px-3 py-3 tabular-nums">{later ? `~${formatAUD(later)}` : formatAUD(0)}</td><td className="px-3 py-3 font-bold tabular-nums">~{formatAUD(total)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default SavingsValueComparison;
