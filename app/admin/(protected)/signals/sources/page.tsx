import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listFeedSources,
  type AdminFeedSource,
} from "@/lib/admin/repos/feedSources";
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
  const sources = await listFeedSources();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Feed sources</h1>
          <p className="text-sm text-muted-foreground">
            The allowlist for the planned OzBargain monitor. Registration only.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/signals/sources/new">New feed source</Link>
        </Button>
      </header>

      <p className="rounded-lg border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">No fetching yet.</span>{" "}
        {FEED_ENABLE_WARNING}
      </p>

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
              <TableHead>Label</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Enabled</TableHead>
              <TableHead>Last status</TableHead>
              <TableHead className="text-right">Failures</TableHead>
              <TableHead>Next fetch</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sources.map((source) => (
              <TableRow key={source.id}>
                <TableCell className="max-w-xs font-medium">
                  <span className="line-clamp-2">{source.label}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {source.feedUrl}
                  </span>
                </TableCell>
                <TableCell>{KIND_LABELS[source.kind]}</TableCell>
                <TableCell>
                  {source.storeName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={source.isEnabled ? "default" : "outline"}>
                    {source.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {source.lastStatus ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {source.failureCount}
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatDate(source.nextEarliestFetchAt)}
                </TableCell>
                <TableCell className="text-right">
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
