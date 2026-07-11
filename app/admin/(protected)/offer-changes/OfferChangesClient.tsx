"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, FilePlus2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AdminOfferChange } from "@/lib/admin/repos/offerChanges";
import type { OfferChangeView } from "@/lib/admin/offerChangeViews";
import { safeHttpsUrl } from "@/lib/security/urlPolicy";
import {
  applyOfferChangeAction,
  ignoreOfferChangeAction,
  markDuplicateOfferChangeAction,
} from "./actions";

/**
 * Offer-change review queue (client island). Renders staged candidates with a
 * previous→proposed comparison and the three review actions. Apply is gated
 * behind an explicit window.confirm() AND a server-side recheck — it is the only
 * action that changes a published offer. `canApply` / `applyHint` are computed on
 * the server (the pure planner) and passed in, so this island never imports the
 * detection module.
 */

const SOURCE_TYPE_LABELS: Record<AdminOfferChange["sourceType"], string> = {
  cashback: "Cashback",
  gift_card: "Gift card",
  points: "Points",
  promo: "Promo / discount",
  card_offer: "Card offer",
};

function Row({ item }: { item: OfferChangeView }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const detectedHref = item.detectedUrl
    ? safeHttpsUrl(item.detectedUrl)
    : null;
  const cardDraftHref = useMemo(() => {
    if (item.sourceType !== "card_offer" || item.targetId) return null;
    const params = new URLSearchParams({
      provider:
        typeof item.payload.provider === "string"
          ? item.payload.provider
          : item.sourceName,
      card_name: item.detectedTitle,
      offer_summary: item.rawSummary || item.detectedTitle,
      reference_url: item.detectedUrl,
    });
    for (const [param, key] of [
      ["bonus_points", "bonusPoints"],
      ["annual_fee", "annualFee"],
    ] as const) {
      const value = item.payload[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        params.set(param, String(value));
      }
    }
    params.set(
      "offer_type",
      params.has("bonus_points") ? "points_bonus" : "annual_fee_discount"
    );
    return `/admin/card-offers/new?${params.toString()}`;
  }, [item]);

  const run = (action: () => Promise<{ ok: true } | { error: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if ("error" in result) setError(result.error);
    });
  };

  const onApply = () => {
    if (
      !window.confirm(
        `Apply this change to the live offer?\n\n` +
          `${item.applyHint}.\n\n` +
          `This updates published data immediately and is logged in the audit trail. ` +
          `Ignore or Mark duplicate if you are unsure.`
      )
    ) {
      return;
    }
    run(() => applyOfferChangeAction(item.id));
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {SOURCE_TYPE_LABELS[item.sourceType]}
              </Badge>
              <span className="text-sm font-medium">{item.sourceName}</span>
              {item.storeName ? (
                <span className="text-sm text-muted-foreground">
                  · {item.storeName}
                </span>
              ) : null}
              <Badge
                variant="outline"
                className="text-muted-foreground"
                title="Detection confidence"
              >
                {item.confidence}
              </Badge>
            </div>
            <p className="font-medium">{item.detectedTitle}</p>
          </div>
        </div>

        {/* previous → proposed comparison */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
          <div>
            <span className="block text-xs text-muted-foreground">Current</span>
            <span className="font-medium tabular-nums">
              {item.previousValue ?? "—"}
            </span>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
          <div>
            <span className="block text-xs text-muted-foreground">Proposed</span>
            <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
              {item.proposedValue || "—"}
            </span>
          </div>
          {item.detectedRateOrDiscount ? (
            <span className="text-xs text-muted-foreground">
              detected: {item.detectedRateOrDiscount}
            </span>
          ) : null}
        </div>

        {item.rawSummary ? (
          <p className="text-sm text-muted-foreground">{item.rawSummary}</p>
        ) : null}

        {item.sourceType === "card_offer" ? (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>
              Bonus points: {String(item.payload.bonusPoints ?? "not detected")}
            </span>
            <span>
              Annual fee: {String(item.payload.annualFee ?? "not detected")}
            </span>
          </div>
        ) : null}

        {detectedHref ? (
          <a
            href={detectedHref}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            View source
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            type="button"
            size="sm"
            onClick={onApply}
            disabled={isPending || !item.canApply}
            title={item.applyHint}
            className={cn(
              "bg-emerald-600 text-white hover:bg-emerald-700",
              !item.canApply && "cursor-not-allowed"
            )}
          >
            Apply
          </Button>
          {cardDraftHref ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={cardDraftHref} className="gap-1.5">
                <FilePlus2 className="size-3.5" />
                Create unpublished draft
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run(() => ignoreOfferChangeAction(item.id))}
            disabled={isPending}
          >
            Ignore
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run(() => markDuplicateOfferChangeAction(item.id))}
            disabled={isPending}
          >
            Mark duplicate
          </Button>
          {!item.canApply ? (
            <span className="text-xs text-muted-foreground" title={item.applyHint}>
              Apply unavailable — {item.applyHint}.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function OfferChangesClient({ items }: { items: OfferChangeView[] }) {
  const [sourceType, setSourceType] = useState<"all" | AdminOfferChange["sourceType"]>(
    "all"
  );
  const filtered = useMemo(
    () =>
      sourceType === "all"
        ? items
        : items.filter((item) => item.sourceType === sourceType),
    [items, sourceType]
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="offer-change-source" className="text-sm font-medium">
          Source type
        </label>
        <select
          id="offer-change-source"
          value={sourceType}
          onChange={(event) =>
            setSourceType(
              event.target.value as "all" | AdminOfferChange["sourceType"]
            )
          }
          className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm"
        >
          <option value="all">All</option>
          {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} of {items.length}
        </span>
      </div>
      {filtered.map((item) => (
        <Row key={item.id} item={item} />
      ))}
    </div>
  );
}

export default OfferChangesClient;
