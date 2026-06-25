import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listOfferChanges } from "@/lib/admin/repos/offerChanges";
import {
  isApplyPlan,
  planOfferApplication,
  type ApplyPlan,
} from "@/lib/monitor/offerChanges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import OfferChangesClient, { type OfferChangeView } from "./OfferChangesClient";

export const metadata: Metadata = {
  title: "Offer changes | DealStack AU admin",
};

const TABLE_LABELS: Record<string, string> = {
  cashback_offers: "cashback rate",
  gift_card_offers: "gift-card discount",
  points_offers: "points rate",
  stores: "promo discount",
};

function humanApplyHint(plan: ApplyPlan): string {
  const isPercent = ["rate_percent", "discount_percent"].includes(plan.column);
  const formatted = isPercent ? `${plan.value}%` : String(plan.value);
  const label = TABLE_LABELS[plan.table] ?? plan.table;
  return `Will update ${label} to ${formatted} — confirm before applying`;
}

export default async function OfferChangesPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const candidates = await listOfferChanges("new");

  // Compute the apply preview on the SERVER (pure planner) so the client island
  // never imports the detection module. canApply mirrors exactly what the repo's
  // applyOfferChange() will allow.
  const items: OfferChangeView[] = candidates.map((c) => {
    const plan = planOfferApplication({
      sourceType: c.sourceType,
      reviewState: c.reviewState,
      targetId: c.targetId,
      proposedValue: c.proposedValue,
    });
    return {
      ...c,
      canApply: isApplyPlan(plan),
      applyHint: isApplyPlan(plan) ? humanApplyHint(plan) : plan.skip,
    };
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Offer changes</h1>
          <p className="text-sm text-muted-foreground">
            Detected changes to cashback rates, gift-card discounts, points and
            promos — awaiting review.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/signals/sources">Feed sources</Link>
        </Button>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          Nothing here is published automatically.
        </span>{" "}
        Detected changes are staged for review. Applying updates the live offer
        only after you confirm; Ignore and Mark duplicate never change public
        data.
      </p>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No offer changes to review</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              When the monitor detects a changed cashback rate, gift-card
              discount, points offer or promo from an approved source, it appears
              here. Applied, ignored and duplicate items are hidden.
            </p>
          </CardContent>
        </Card>
      ) : (
        <OfferChangesClient items={items} />
      )}
    </div>
  );
}
