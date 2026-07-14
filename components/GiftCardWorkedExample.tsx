"use client";

import { useState } from "react";
import Link from "next/link";
import { Calculator } from "lucide-react";
import {
  buildWorkedExample,
  defaultPointValueCents,
  type WorkedExampleInputs,
} from "@/lib/giftcards/value";

/**
 * Worked example for one gift-card offer at a user-selected face value.
 * All arithmetic comes from the shared lib/giftcards/value.ts formulas; cash
 * savings and reward estimates are rendered in visually separate groups so
 * points are never presented as money off the price.
 */

const FACE_VALUES = [50, 100, 200, 500] as const;

const aud = (n: number) =>
  n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

function Line({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm ${strong ? "font-semibold" : "font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

export default function GiftCardWorkedExample({
  inputs,
  stackSearchQuery,
}: {
  inputs: WorkedExampleInputs;
  stackSearchQuery: string;
}) {
  const [faceValue, setFaceValue] = useState<number>(100);
  const initialPointValue = inputs.pointsValueCents ?? defaultPointValueCents(inputs.pointsProgram) ?? 0;
  const [pointValueCents, setPointValueCents] = useState(initialPointValue);
  const [transferRatio, setTransferRatio] = useState(1);
  const example = buildWorkedExample({ ...inputs, pointsValueCents: pointValueCents }, faceValue);
  const stackHref = `/search?${new URLSearchParams({ q: stackSearchQuery, spend: String(Math.max(1, faceValue || 1)) }).toString()}`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Gift-card face value">
        {FACE_VALUES.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFaceValue(value)}
            aria-pressed={faceValue === value}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              faceValue === value
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "bg-background hover:bg-muted"
            }`}
          >
            ${value}
          </button>
        ))}
      </div>
      <label className="mt-3 grid max-w-xs gap-1 text-xs font-medium text-muted-foreground">
        Custom face value ($)
        <input type="number" min="1" max="100000" step="1" inputMode="decimal" value={faceValue} onChange={(event) => setFaceValue(Number(event.target.value) || 0)} className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground" />
      </label>

      {(inputs.pointsMultiplier ?? 0) > 0 || (inputs.fixedPoints ?? 0) > 0 ? <div className="mt-3 grid gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium text-muted-foreground">Cents per point<input type="number" min="0" step="0.1" value={pointValueCents} onChange={(event) => setPointValueCents(Number(event.target.value) || 0)} className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground" /></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">Destination points per source point<input type="number" min="0" step="0.1" value={transferRatio} onChange={(event) => setTransferRatio(Number(event.target.value) || 0)} className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground" /></label></div> : null}

      {example ? (
        <div className="mt-3">
          <dl>
            <Line label="Gift-card face value" value={aud(example.coveredFaceValue)} />
            <Line label="Cash paid" value={aud(example.cashPaid)} strong />
            <Line
              label="Immediate cash saving"
              value={example.acquisitionSaving > 0 ? aud(example.acquisitionSaving) : "$0 — no upfront discount"}
            />
            {example.uncoveredFaceValue > 0 ? (
              <Line
                label="Not covered by the offer"
                value={`${aud(example.uncoveredFaceValue)} (cap reached — full price beyond this)`}
              />
            ) : null}
            {example.bonusValueDollars != null ? (
              <Line
                label="Bonus spending power"
                value={`+${aud(example.bonusValueDollars)}`}
              />
            ) : null}
            <Line label="Total spending power" value={aud(example.totalSpendingPower)} strong />
          </dl>

          {example.points != null && example.rewardValueDollars != null ? (
            <div className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2">
              <dl>
                <Line label="Points earned" value={example.points.toLocaleString("en-AU")} />
                <Line
                  label="Estimated reward value"
                  value={`≈${aud(example.rewardValueDollars)} at ${example.pointValueCents}c/point`}
                />
                <Line label="Effective economic cost" value={`≈${aud(example.effectiveCost)}`} />
                <Line label="Transfer estimate" value={`${Math.floor(example.points * transferRatio).toLocaleString("en-AU")} destination points`} />
              </dl>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                <strong>Points are not cash.</strong> The reward value is an
                estimate at our published rate and is shown separately from the
                cash you pay.
              </p>
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calculator aria-hidden className="size-3.5" />
              Effective economic cost: {aud(example.effectiveCost)} for{" "}
              {aud(example.totalSpendingPower)} of spending power.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          This offer has no quantifiable saving at a set face value, so a worked
          example can&apos;t be shown honestly.
        </p>
      )}
      <Link href={stackHref} className="mt-4 inline-flex rounded-lg border px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-muted dark:text-emerald-300">Build compatible final stack</Link>
    </div>
  );
}
