import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Info, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin/auth";
import { getMonitorStatus } from "@/lib/admin/repos/monitorStatus";
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
          Read-only health snapshot of the planned OzBargain monitor. No fetcher
          or cron exists yet — this page only reports flags and counts.
        </p>
      </header>

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

      {/* Recent fetch log (expected empty until a fetcher exists). */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent fetch runs</CardTitle>
        </CardHeader>
        <CardContent>
          {status.recentFetchLog.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No monitor runs recorded yet. (No fetcher is implemented.)
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
