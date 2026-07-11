import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listOfferChanges } from "@/lib/admin/repos/offerChanges";
import { ozbOfferDetectEnabled } from "@/lib/env";
import { buildOfferChangeViews } from "@/lib/admin/offerChangeViews";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import DetectionPreviewClient from "./DetectionPreviewClient";
import OfferChangesClient from "./OfferChangesClient";

export const metadata: Metadata = {
  title: "Offer changes | DealStack AU admin",
};

export default async function OfferChangesPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const candidates = await listOfferChanges("new");

  // Compute the apply preview on the SERVER (pure planner) so the client island
  // never imports the detection module. canApply mirrors exactly what the repo's
  // applyOfferChange() will allow.
  const items = buildOfferChangeViews(candidates);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Offer changes</h1>
          <p className="text-sm text-muted-foreground">
            Detected changes to cashback rates, gift-card discounts, points,
            promos and card offers — awaiting review.
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

      <DetectionPreviewClient initialFlagEnabled={ozbOfferDetectEnabled()} />

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">No offer changes to review</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              When the monitor detects a changed cashback rate, gift-card
              discount, points offer, promo or card offer from an approved
              source, it appears here. Applied, ignored and duplicate items are
              hidden.
            </p>
          </CardContent>
        </Card>
      ) : (
        <OfferChangesClient items={items} />
      )}
    </div>
  );
}
