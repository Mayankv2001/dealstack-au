import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  countNewFeedItems,
  listNewFeedItems,
  QUEUE_PAGE_LIMIT,
} from "@/lib/admin/repos/feedQueue";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import QueueClient from "./QueueClient";

export const metadata: Metadata = {
  title: "Deal review queue | DealStack AU admin",
};

export default async function FeedQueuePage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  // The read is capped at QUEUE_PAGE_LIMIT, so also fetch the true backlog
  // count — the banner below must never let a capped view pass as the whole
  // queue (the dashboard already reports the same true number).
  const [items, totalNew] = await Promise.all([
    listNewFeedItems(QUEUE_PAGE_LIMIT),
    countNewFeedItems(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">
            Deal review queue
          </h1>
          <p className="text-sm text-muted-foreground">
            New OzBargain deals awaiting one human publication decision.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/signals">Back to signals</Link>
        </Button>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">One review step.</span>{" "}
        Approve publishes the selected deal; Reject archives the queue record
        without deleting history. Fetching never publishes automatically.
      </p>

      {totalNew > items.length ? (
        <p className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Showing the newest{" "}
          <strong className="font-medium text-foreground">{items.length}</strong>{" "}
          of{" "}
          <strong className="font-medium text-foreground">{totalNew}</strong>{" "}
          review items. Older items appear as these are approved or rejected.
        </p>
      ) : null}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="size-8 text-muted-foreground" />
            <p className="font-medium">The queue is empty</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              No feed items are waiting for review. Approved and rejected items
              remain archived in the database.
            </p>
          </CardContent>
        </Card>
      ) : (
        // Client island: in-memory search/filter/sort and scoped bulk moderation.
        <QueueClient items={items} />
      )}
    </div>
  );
}
