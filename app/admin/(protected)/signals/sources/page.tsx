import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Info } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listFeedSources,
  type AdminFeedSource,
} from "@/lib/admin/repos/feedSources";
import { isMonitoringApproved } from "@/lib/admin/repos/compliance";
import { FEED_ENABLE_WARNING } from "@/components/admin/FeedSourceForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { setEnabled } from "./actions";

export const metadata: Metadata = {
  title: "Feed sources | DealStack AU admin",
};

const KIND_LABELS: Record<AdminFeedSource["kind"], string> = {
  front: "Front page",
  store: "Store",
  category: "Category",
};

// Deterministic AU-local timestamp (server-only render).
const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatDate(iso: string | null): string {
  return iso ? DATE_FMT.format(new Date(iso)) : "—";
}

export default async function FeedSourcesListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const [sources, complianceApproved] = await Promise.all([
    listFeedSources(),
    isMonitoringApproved(),
  ]);

  const enabledCount = sources.filter((s) => s.isEnabled).length;
  const enabledWithoutApproval = !complianceApproved && enabledCount > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Feed sources</h1>
          <p className="text-sm text-muted-foreground">
            Approved feed allowlist for the gated OzBargain monitor. Enabling a
            source stages items for review; it never publishes them.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/signals/sources/new">New feed source</Link>
        </Button>
      </header>

      {/* Strong warning: a feed is enabled but compliance is not approved. */}
      {enabledWithoutApproval ? (
        <div className="flex items-start gap-2.5 rounded-lg border-2 border-destructive bg-destructive/15 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>
            <span className="font-semibold text-destructive">
              {enabledCount} feed{enabledCount === 1 ? " is" : "s are"} enabled
              without an approved compliance review.
            </span>{" "}
            Disable {enabledCount === 1 ? "it" : "them"} until an approved review
            is on file — do not run the monitor against{" "}
            {enabledCount === 1 ? "it" : "them"}.
          </p>
        </div>
      ) : null}

      <div className="flex items-start gap-2.5 rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
        <p>
          <span className="font-medium text-foreground">
            Registration only — fetching happens only via the manual{" "}
            <code className="text-xs">monitor:feeds</code> script.
          </span>{" "}
          {FEED_ENABLE_WARNING}
        </p>
      </div>

      {sources.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No feed sources yet.{" "}
          <Link
            href="/admin/signals/sources/new"
            className="font-medium underline"
          >
            Add the first one
          </Link>
          .
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-56">Feed source</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead className="min-w-44">Monitor state</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                {/* Wraps instead of truncating, so long labels/URLs stay readable. */}
                <TableCell className="max-w-sm align-top whitespace-normal">
                  <span className="font-medium break-words">
                    {source.label}
                  </span>
                  <span className="mt-0.5 block text-xs break-all text-muted-foreground">
                    {source.feedUrl}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  {KIND_LABELS[source.kind]}
                </TableCell>
                <TableCell className="align-top">
                  {source.storeName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge
                    variant="outline"
                    className={cn(
                      source.isEnabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "text-muted-foreground"
                    )}
                  >
                    {source.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="align-top">
                  <dl className="space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      Status:{" "}
                      <span className="text-foreground">
                        {source.lastStatus ?? "—"}
                      </span>
                    </div>
                    <div>
                      Failures:{" "}
                      <span className="text-foreground tabular-nums">
                        {source.failureCount}
                      </span>
                    </div>
                    <div>
                      Next:{" "}
                      <span className="text-foreground tabular-nums">
                        {formatDate(source.nextEarliestFetchAt)}
                      </span>
                    </div>
                  </dl>
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/signals/sources/${source.id}/edit`}>
                        Edit
                      </Link>
                    </Button>
                    {/* POST form so the bound server action flips the flag. */}
                    <form
                      action={setEnabled.bind(
                        null,
                        source.id,
                        !source.isEnabled
                      )}
                    >
                      <Button type="submit" variant="outline" size="sm">
                        {source.isEnabled ? "Disable" : "Enable"}
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
