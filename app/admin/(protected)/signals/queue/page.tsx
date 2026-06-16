import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Inbox,
  RefreshCw,
  Rss,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { listNewFeedItems } from "@/lib/admin/repos/feedQueue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { importItem, ignoreItem, markDuplicate } from "./actions";

export const metadata: Metadata = {
  title: "Feed import queue | DealStack AU admin",
};

// Deterministic AU-local timestamps (server-only render, no client island).
const QUEUE_DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatDate(iso: string | null): string {
  return iso ? QUEUE_DATE_FMT.format(new Date(iso)) : "—";
}

/** Hostname of an external link, for a safer "where does this go" display. */
function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

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
        <div className="space-y-4">
          {items.map((item) => {
            const host = safeHost(item.link);
            return (
            <Card key={item.id} className="flex flex-col">
              <CardHeader className="gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="gap-1">
                    <Rss className="size-3" />
                    {item.feedSourceLabel ?? "Unknown feed"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {item.reviewState}
                  </Badge>
                  {item.existingSignal ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-500/50 text-amber-700 dark:text-amber-400"
                    >
                      <AlertTriangle className="size-3" />
                      Already imported ({item.existingSignal.status})
                    </Badge>
                  ) : null}
                  {item.categories.map((category) => (
                    <Badge key={category} variant="secondary">
                      {category}
                    </Badge>
                  ))}
                </div>
                <CardTitle className="text-base leading-snug">
                  {item.rawTitle}
                </CardTitle>
              </CardHeader>

              <CardContent className="flex-1 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {item.rawSummary || (
                    <span className="italic">No summary in the feed item.</span>
                  )}
                </p>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {/* Safer link: surface the destination host, show the full URL
                      as plain text, nofollow + noopener, never auto-opened. */}
                  <span className="inline-flex items-center gap-1">
                    <ExternalLink className="size-3 shrink-0" />
                    Source host:{" "}
                    <span className="font-medium text-foreground">
                      {host ?? "unknown / unparseable"}
                    </span>
                  </span>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="nofollow noopener noreferrer"
                    className="w-fit break-all underline-offset-2 hover:underline"
                  >
                    {item.link}
                  </a>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3" />
                    Posted {formatDate(item.postedAt)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className="size-3" />
                    Fetched {formatDate(item.fetchedAt)}
                  </span>
                  <span className="break-all font-mono">
                    native id: {item.sourceNativeId}
                  </span>
                  <span className="font-mono">
                    hash:{" "}
                    {item.contentHash
                      ? `${item.contentHash.slice(0, 12)}…`
                      : "—"}
                  </span>
                  {item.existingSignal ? (
                    <span className="text-amber-700 dark:text-amber-400">
                      Importing will link to existing signal{" "}
                      <span className="font-mono">{item.existingSignal.id}</span>{" "}
                      (status: {item.existingSignal.status}) instead of creating a
                      new one.
                    </span>
                  ) : null}
                </div>
              </CardContent>

              <CardFooter className="flex flex-wrap gap-2">
                {/* POST forms so each bound server action runs on the server. */}
                <form action={importItem.bind(null, item.id)}>
                  <Button type="submit" size="sm">
                    Import as pending signal
                  </Button>
                </form>
                <form action={ignoreItem.bind(null, item.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Ignore
                  </Button>
                </form>
                <form action={markDuplicate.bind(null, item.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Mark duplicate
                  </Button>
                </form>
              </CardFooter>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
