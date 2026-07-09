"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { OfferChangeCandidateInsert } from "@/lib/monitor/offerChanges";
import { previewDetectionAction, type DetectionPreviewResult } from "./actions";

/**
 * "Preview detection (dry run)" panel — the missing visibility that makes the
 * documented go-live review (eyeball a few dry-runs, then flip
 * OZB_OFFER_DETECT_ENABLED) actually possible from the admin portal.
 *
 * Runs regardless of the flag's state (the flag gates the write hooks; this
 * exists for pre-enable review) — only requireAdmin() gates it, enforced
 * server-side in previewDetectionAction. Never imports lib/admin/repos/* or
 * lib/env directly: it only gets data via the action result and the
 * initialFlagEnabled prop, mirroring OfferChangesClient's server-computed-props
 * convention.
 */

const SOURCE_TYPE_LABELS: Record<OfferChangeCandidateInsert["source_type"], string> = {
  cashback: "Cashback",
  gift_card: "Gift card",
  points: "Points",
  promo: "Promo / discount",
};

function CandidateRow({ c }: { c: OfferChangeCandidateInsert }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{SOURCE_TYPE_LABELS[c.source_type]}</Badge>
        <span className="font-medium">{c.source_name}</span>
        <span className="text-muted-foreground">
          · {c.merchant_id ?? "no merchant resolved"}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto text-xs",
            c.target_id
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-muted-foreground"
          )}
        >
          {c.target_id ? "target linked" : "unresolved"}
        </Badge>
      </div>
      <p className="font-medium">{c.detected_title}</p>
      <p className="text-muted-foreground">
        {c.previous_value ?? "?"} → {" "}
        <span className="font-medium text-emerald-700 dark:text-emerald-400">
          {c.proposed_value}
        </span>
      </p>
      {c.detected_url ? (
        <a
          href={c.detected_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
        >
          {c.detected_url}
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

export function DetectionPreviewClient({
  initialFlagEnabled,
}: {
  initialFlagEnabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DetectionPreviewResult | null>(null);

  const flagEnabled = result && "ok" in result ? result.flagEnabled : initialFlagEnabled;

  const onRun = () => {
    startTransition(async () => {
      setResult(await previewDetectionAction());
    });
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-medium">Preview detection (dry run)</h2>
            <p className="text-sm text-muted-foreground">
              Runs the offer-change heuristics over feed items staged in the
              last 7 days and shows what WOULD be staged. Nothing is written.
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              flagEnabled
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-muted-foreground"
            }
          >
            Detection flag: {flagEnabled ? "ON" : "OFF"}
          </Badge>
        </div>

        <Button type="button" size="sm" onClick={onRun} disabled={isPending}>
          {isPending ? "Running…" : "Run preview"}
        </Button>

        {result && "error" in result ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {result.error}
          </p>
        ) : null}

        {result && "ok" in result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Scanned: {result.scanned}</span>
              <span>Raw detections: {result.detected}</span>
              <span>Unique after dedupe: {result.deduped}</span>
            </div>
            {result.deduped === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing new would be staged — items already staged/ignored are
                deduped by content hash and URL.
              </p>
            ) : (
              <div className="space-y-2">
                {result.candidates.map((c) => (
                  <CandidateRow key={c.content_hash} c={c} />
                ))}
              </div>
            )}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Merchant matching runs against the known store list — feed items
          about a store that only exists in the database (not yet aliased)
          resolve no merchant and are skipped by design; that is expected, not
          a bug.
        </p>
      </CardContent>
    </Card>
  );
}

export default DetectionPreviewClient;
