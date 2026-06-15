import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAuditLog } from "@/lib/admin/repos/audit";
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

export const metadata: Metadata = {
  title: "Audit log | DealStack AU admin",
};

// Known values to filter by (the tables/actions this app logs).
const TABLE_OPTIONS = [
  "cashback_offers",
  "gift_card_offers",
  "points_offers",
  "ozbargain_signals",
  "weekly_deals",
  "feed_sources",
  "feed_items",
  "compliance_reviews",
];

const ACTION_OPTIONS = [
  "create",
  "update",
  "publish",
  "unpublish",
  "status",
  "enable",
  "disable",
  "import",
  "ignore",
  "mark-duplicate",
];

const controlClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

// Deterministic AU-local timestamp (server-only render).
const DATE_FMT = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "Australia/Sydney",
});

function formatValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return JSON.stringify(value);
}

/** Compact one-line summary of a diff jsonb object. */
function summariseDiff(diff: Record<string, unknown> | null): string {
  if (!diff || typeof diff !== "object") return "—";
  const entries = Object.entries(diff);
  if (entries.length === 0) return "—";
  return entries
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(" · ");
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string; action?: string }>;
}) {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();

  const { table, action } = await searchParams;
  const tableName = TABLE_OPTIONS.includes(table ?? "") ? table : undefined;
  const actionName = ACTION_OPTIONS.includes(action ?? "") ? action : undefined;
  const hasFilter = Boolean(tableName || actionName);

  const entries = await listAuditLog({ tableName, action: actionName });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Recent admin actions, newest first. Logging starts going forward — past
          actions are not backfilled.
        </p>
      </header>

      {/* GET form — filters are applied server-side via the query string. */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Table
          <select name="table" defaultValue={tableName ?? ""} className={controlClass}>
            <option value="">All tables</option>
            {TABLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Action
          <select name="action" defaultValue={actionName ?? ""} className={controlClass}>
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
        {hasFilter ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/audit">Clear</Link>
          </Button>
        ) : null}
      </form>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {hasFilter
            ? "No audit events match these filters."
            : "No audit events recorded yet. New admin actions will appear here."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-40">Time</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Table</TableHead>
              <TableHead>Row</TableHead>
              <TableHead className="min-w-56">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="align-top text-muted-foreground tabular-nums">
                  {DATE_FMT.format(new Date(entry.createdAt))}
                </TableCell>
                <TableCell className="align-top">
                  {entry.actorEmail ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline">{entry.action}</Badge>
                </TableCell>
                <TableCell className="align-top font-mono text-xs">
                  {entry.tableName}
                </TableCell>
                <TableCell className="align-top max-w-40 truncate font-mono text-xs text-muted-foreground">
                  {entry.rowId ?? "—"}
                </TableCell>
                <TableCell className="align-top whitespace-normal break-words text-xs text-muted-foreground">
                  {summariseDiff(entry.diff)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
