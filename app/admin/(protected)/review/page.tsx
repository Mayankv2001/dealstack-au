import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, History, Inbox, RefreshCw } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  countNewFeedItems,
  listNewFeedItems,
  listRecentlyReviewedFeedItems,
  QUEUE_PAGE_LIMIT,
} from "@/lib/admin/repos/feedQueue";
import { listOfferChanges } from "@/lib/admin/repos/offerChanges";
import { buildOfferChangeViews } from "@/lib/admin/offerChangeViews";
import { getMonitorStatus } from "@/lib/admin/repos/monitorStatus";
import { listAuditLog } from "@/lib/admin/repos/audit";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/admin/ActionButton";
import QueueClient from "../signals/queue/QueueClient";
import { restoreItem } from "../signals/queue/actions";
import OfferChangesClient from "../offer-changes/OfferChangesClient";

export const metadata: Metadata = {
  title: "Review | DealStack AU admin",
};

type Tab = "deals" | "changes" | "history";

function selectedTab(value: string | string[] | undefined): Tab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === "changes" || tab === "history" ? tab : "deals";
}

const DATE = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Sydney",
});

function formatDate(value: string | null): string {
  return value ? DATE.format(new Date(value)) : "Not recorded";
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  await requireAdmin();
  const tab = selectedTab((await searchParams).tab);

  const tabs: { id: Tab; label: string }[] = [
    { id: "deals", label: "Deals" },
    { id: "changes", label: "Offer changes" },
    { id: "history", label: "History" },
  ];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Review</h1>
        <p className="text-sm text-muted-foreground">
          One place for deal decisions, detected changes and pipeline history.
        </p>
      </header>

      <nav aria-label="Review views" className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((item) => (
          <Button
            key={item.id}
            asChild
            size="sm"
            variant={tab === item.id ? "secondary" : "ghost"}
          >
            <Link
              href={`/admin/review?tab=${item.id}`}
              aria-current={tab === item.id ? "page" : undefined}
            >
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>

      {tab === "deals" ? <DealsReview /> : null}
      {tab === "changes" ? <ChangesReview /> : null}
      {tab === "history" ? <ReviewHistory /> : null}
    </div>
  );
}

async function DealsReview() {
  const [items, total] = await Promise.all([
    listNewFeedItems(QUEUE_PAGE_LIMIT),
    countNewFeedItems(),
  ]);
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-dashed py-12 text-center">
        <Inbox className="size-8 text-muted-foreground" />
        <p className="font-medium">The deal queue is empty</p>
      </div>
    );
  }
  return (
    <section className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Showing {items.length} of {total}. Approve publishes after human review;
        Reject archives the source record.
      </p>
      <QueueClient items={items} />
    </section>
  );
}

async function ChangesReview() {
  const items = buildOfferChangeViews(await listOfferChanges("new"));
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-dashed py-12 text-center">
        <CheckCircle2 className="size-8 text-muted-foreground" />
        <p className="font-medium">No detected changes await review</p>
      </div>
    );
  }
  return <OfferChangesClient items={items} />;
}

async function ReviewHistory() {
  const [monitor, audit, reviewed] = await Promise.all([
    getMonitorStatus(),
    listAuditLog({ pageSize: 20 }),
    listRecentlyReviewedFeedItems(20),
  ]);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <History className="size-4" /> Recent pipeline runs
        </h2>
        {monitor.recentPipelineRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pipeline run recorded.</p>
        ) : (
          <div className="overflow-x-auto border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="p-2">Started</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Fetched</th>
                  <th className="p-2">New</th>
                  <th className="p-2">Archived</th>
                  <th className="p-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {monitor.recentPipelineRuns.map((run) => (
                  <tr key={run.id} className="border-t">
                    <td className="p-2">{formatDate(run.startedAt)}</td>
                    <td className="p-2"><Badge variant="outline">{run.status}</Badge></td>
                    <td className="p-2 tabular-nums">{run.itemsFetched}</td>
                    <td className="p-2 tabular-nums">{run.itemsNew}</td>
                    <td className="p-2 tabular-nums">
                      {run.expiredArchived + run.invalidArchived + run.staleArchived + run.cardOffersArchived}
                    </td>
                    <td className="max-w-sm p-2 text-muted-foreground">{run.errors.join("; ") || "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Recently rejected or ignored</h2>
        {reviewed.length === 0 ? (
          <p className="text-sm text-muted-foreground">No restorable decisions.</p>
        ) : (
          <div className="divide-y border">
            {reviewed.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-sm font-medium">{item.rawTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.reviewState} by {item.reviewedBy ?? "system"} at {formatDate(item.reviewedAt)}
                  </p>
                </div>
                <ActionButton run={restoreItem.bind(null, item.id)} className="gap-1.5">
                  <RefreshCw className="size-3.5" /> Restore to queue
                </ActionButton>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Recent audit events</h2>
        <div className="divide-y border">
          {audit.entries.map((entry) => (
            <div key={entry.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[10rem_1fr_12rem]">
              <span>{formatDate(entry.createdAt)}</span>
              <span>{entry.action} · {entry.tableName} · {entry.rowId ?? "batch"}</span>
              <span className="text-muted-foreground">{entry.actorEmail ?? "system"}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
