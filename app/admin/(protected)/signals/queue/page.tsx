import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listNewFeedItems } from "@/lib/admin/repos/feedQueue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import QueueClient from "./QueueClient";

export const metadata: Metadata = {
  title: "Feed import queue | DealStack AU admin",
};

export default async function FeedQueuePage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const items = await listNewFeedItems();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">
            Feed import queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Staged OzBargain feed items awaiting manual review.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/signals">Back to signals</Link>
        </Button>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Staged items only.</span>{" "}
        This queue contains staged feed items only. Importing creates a pending
        signal for manual review; nothing is published automatically.
      </p>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">The queue is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No feed items are waiting for review. Imported, ignored and
              duplicate items are hidden here.
            </p>
          </CardContent>
        </Card>
      ) : (
        // Client island: in-memory search / filter / presets + scoped bulk ignore.
        // The Import / Ignore / Mark duplicate actions are unchanged.
        <QueueClient items={items} />
      )}
    </div>
  );
}
