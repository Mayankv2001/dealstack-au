import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getMonitorStatus,
  type MonitorFetchLogEntry,
} from "@/lib/admin/repos/monitorStatus";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Monitor status | DealStack AU admin",
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

function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-2xl font-semibold",
            tone === "ok" && "text-emerald-600 dark:text-emerald-400",
            tone === "warn" && "text-amber-600 dark:text-amber-400"
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CountPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/** Compact summary of a single fetch-log row (last success / last problem). */
function FetchLogSummary({
  log,
  emptyText,
}: {
  log: MonitorFetchLogEntry | null;
  emptyText: string;
}) {
  if (!log) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{log.feedSourceLabel ?? "—"}</p>
      <p className="text-xs text-muted-foreground tabular-nums">
        {formatDate(log.startedAt)} · HTTP {log.httpStatus ?? "—"} · seen{" "}
        {log.itemsSeen} · new {log.itemsNew}
      </p>
      {log.error ? (
        <p className="break-words text-xs text-destructive">{log.error}</p>
      ) : null}
    </div>
  );
}

export default async function MonitorStatusPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const status = await getMonitorStatus();

  const hasRisk = status.enabledWithoutApproval > 0;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Monitor status</h1>
        <p className="text-sm text-muted-foreground">
          Read-only health snapshot of the OzBargain monitor. This page never
          fetches feeds. Fetching only happens — when enabled — via the manual{" "}
          <code className="text-xs">monitor:feeds</code> script or the
          secret-gated Vercel Cron route. Nothing is published automatically.
        </p>
      </header>

      {/* Most severe: the master switch is armed but compliance is NOT approved. */}
      {status.envEnabled && !status.complianceApproved ? (
        <div className="flex items-start gap-2.5 rounded-lg border-2 border-destructive bg-destructive/15 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p>
            <span className="font-semibold text-destructive">
              Stop — unsafe configuration.
            </span>{" "}
            <code className="text-xs">OZB_MONITOR_ENABLED</code> is{" "}
            <code className="text-xs">true</code> but no compliance review is
            approved. Set <code className="text-xs">OZB_MONITOR_ENABLED=false</code>{" "}
            until an approved review is on file — do not run the monitor.
          </p>
        </div>
      ) : null}

      {/* Risk: feeds enabled while compliance is not approved. */}
      {hasRisk ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            <span className="font-medium text-destructive">Risk:</span>{" "}
            {status.enabledWithoutApproval}{" "}
            {status.enabledWithoutApproval === 1
              ? "feed source is"
              : "feed sources are"}{" "}
            enabled while compliance is not approved. Disable{" "}
            {status.enabledWithoutApproval === 1 ? "it" : "them"} until an
            approved review is on file.
          </p>
        </div>
      ) : null}

      {/* Gate: compliance must be approved before monitoring. */}
      {!status.complianceApproved ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="font-medium text-foreground">
            Monitoring must stay disabled until compliance review is approved.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p>
            An approved compliance review is on file. Enabling a feed and
            running the monitor are still separate, deliberate steps.
          </p>
        </div>
      )}

      {/* Master switch state. */}
      {!status.envEnabled ? (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-foreground" />
          <p>
            <span className="font-medium text-foreground">
              Monitor master switch is off.
            </span>{" "}
            <code className="text-xs">OZB_MONITOR_ENABLED</code> ={" "}
            <code className="text-xs">{status.envEnabledRaw ?? "unset"}</code>.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Master switch (OZB_MONITOR_ENABLED)"
          value={status.envEnabled ? "On" : "Off"}
          tone={status.envEnabled ? "warn" : "muted"}
          hint={`Value: ${status.envEnabledRaw ?? "unset"}`}
        />
        <StatCard
          label="Compliance approved"
          value={status.complianceApproved ? "Yes" : "No"}
          tone={status.complianceApproved ? "ok" : "warn"}
        />
        <StatCard
          label="Feed sources"
          value={`${status.feedSourcesEnabled} / ${status.feedSourcesTotal}`}
          hint="Enabled / total"
        />
        <StatCard
          label="Feed queue pending"
          value={String(status.feedQueuePending)}
          hint="Items awaiting review"
        />
      </div>

      {/* Staged feed items by triage state. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Staged feed items ({status.feedItemsTotal})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CountPill label="New" value={status.feedItemCounts.new} />
            <CountPill label="Imported" value={status.feedItemCounts.imported} />
            <CountPill label="Ignored" value={status.feedItemCounts.ignored} />
            <CountPill label="Duplicate" value={status.feedItemCounts.duplicate} />
          </div>
        </CardContent>
      </Card>

      {/* Last successful vs last problem fetch run. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last successful run</CardTitle>
          </CardHeader>
          <CardContent>
            <FetchLogSummary
              log={status.lastSuccessLog}
              emptyText="No successful run recorded yet."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Last blocked / error run</CardTitle>
          </CardHeader>
          <CardContent>
            <FetchLogSummary
              log={status.lastProblemLog}
              emptyText="No blocked or error runs recorded."
            />
          </CardContent>
        </Card>
      </div>

      {/* Error / blocked feed sources. */}
      {status.problemSources.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Error / blocked feed sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.problemSources.map((source) => (
              <div
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span className="font-medium">{source.label}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-destructive">
                    {source.lastStatus}
                  </Badge>
                  <span className="tabular-nums">
                    {source.failureCount} failures
                  </span>
                  <span>{source.isEnabled ? "enabled" : "disabled"}</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Latest staged feed items (any state). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Latest feed items</CardTitle>
        </CardHeader>
        <CardContent>
          {status.latestFeedItems.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No feed items staged yet. Run{" "}
              <code className="text-xs">npm run monitor:feeds -- --write</code> to
              stage items from an enabled feed.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Feed</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Native id</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Fetched</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.latestFeedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs truncate font-medium">
                      {item.rawTitle}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {item.feedSourceLabel ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {item.reviewState}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate font-mono text-xs text-muted-foreground">
                      {item.sourceNativeId}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.contentHash ? `${item.contentHash.slice(0, 10)}…` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(item.fetchedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent fetch runs (latest 5). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent fetch runs</CardTitle>
        </CardHeader>
        <CardContent>
          {status.recentFetchLog.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No monitor runs recorded yet. Runs appear here after{" "}
              <code className="text-xs">npm run monitor:feeds -- --write</code>.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feed</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead className="text-right">HTTP</TableHead>
                  <TableHead className="text-right">Seen</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {status.recentFetchLog.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">
                      {entry.feedSourceLabel ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(entry.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(entry.finishedAt)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.httpStatus ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.itemsSeen}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.itemsNew}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {entry.error ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        This page is read-only — it never fetches feeds. Manage the allowlist on{" "}
        <Link href="/admin/signals/sources" className="underline">
          Feed Sources
        </Link>{" "}
        and record the review on{" "}
        <Link href="/admin/compliance" className="underline">
          Compliance
        </Link>
        .
      </p>
    </div>
  );
}
