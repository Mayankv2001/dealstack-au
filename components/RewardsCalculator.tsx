"use client";

import { useMemo, useState } from "react";
import { formatAUD } from "@/lib/calculateStack";

export function RewardsCalculator({
  programme,
  defaultPointValueCents,
}: {
  programme: string;
  defaultPointValueCents: number;
}) {
  const [spend, setSpend] = useState(500);
  const [multiplier, setMultiplier] = useState(1);
  const [pointValueCents, setPointValueCents] = useState(defaultPointValueCents);
  const [transferRatio, setTransferRatio] = useState(1);
  const result = useMemo(() => {
    const points = Math.max(0, Math.round(spend * multiplier));
    return {
      points,
      estimatedValue: (points * pointValueCents) / 100,
      transferEstimate: Math.floor(points * transferRatio),
    };
  }, [spend, multiplier, pointValueCents, transferRatio]);

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <h2 className="font-semibold">{programme} points calculator</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Edit every assumption. Estimated points value is not cash and does not reduce the purchase price.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm"><span className="font-medium">Eligible spend ($)</span><input type="number" min="1" step="10" value={spend} onChange={(event) => setSpend(Number(event.target.value) || 0)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>
        <label className="text-sm"><span className="font-medium">Points multiplier</span><input type="number" min="0" step="0.1" value={multiplier} onChange={(event) => setMultiplier(Number(event.target.value) || 0)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>
        <label className="text-sm"><span className="font-medium">Cents per point</span><input type="number" min="0" step="0.1" value={pointValueCents} onChange={(event) => setPointValueCents(Number(event.target.value) || 0)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>
        <label className="text-sm"><span className="font-medium">Transfer points per source point</span><input type="number" min="0" step="0.1" value={transferRatio} onChange={(event) => setTransferRatio(Number(event.target.value) || 0)} className="mt-1 h-10 w-full rounded-lg border bg-background px-3" /></label>
      </div>
      <dl className="mt-4 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Cash paid</dt><dd className="text-lg font-bold">{formatAUD(spend)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Points earned</dt><dd className="text-lg font-bold">{result.points.toLocaleString("en-AU")}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Estimated value</dt><dd className="text-lg font-bold text-amber-700">{formatAUD(result.estimatedValue)}</dd></div>
        <div className="sm:col-span-3"><dt className="text-xs text-muted-foreground">Transfer estimate</dt><dd className="font-semibold">{result.transferEstimate.toLocaleString("en-AU")} destination points at the entered ratio</dd></div>
      </dl>
    </div>
  );
}

export default RewardsCalculator;
