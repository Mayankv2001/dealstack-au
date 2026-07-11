import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { AUDIT_PAGE_SIZE, listAuditLog } from "@/lib/admin/repos/audit";
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
  "offer_change_candidates",
  "card_offers",
  "card_offer_correction_reports",
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
  "apply",
  "hide-from-homepage",
  "show-on-homepage",
  "archive",
  "restore",
  "auto-archive-expired",
  "auto-archive-invalid",
  "auto-archive-stale",
  "auto-archive-card",
  "auto-retire-stale",
  "auto-purge-retained",
  "auto-disable-feed",
  "stage-detection",
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
  searchParams: Promise<{
    table?: string;
    action?: string;
    actor?: string;
    row?: string;
    page?: string;
  }>;
}) {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();

  const params = await searchParams;
  const tableName = TABLE_OPTIONS.includes(params.table ?? "")
    ? params.table
    : undefined;
  const actionName = ACTION_OPTIONS.includes(params.action ?? "")
    ? params.action
    : undefined;
  const actorEmail = params.actor?.trim() || undefined;
  const rowId = params.row?.trim() || undefined;
  const hasFilter = Boolean(tableName || actionName || actorEmail || rowId);

  const pageNum = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (pageNum - 1) * AUDIT_PAGE_SIZE;

  const { entries, hasMore } = await listAuditLog({
    tableName,
    action: actionName,
    actorEmail,
    rowId,
    offset,
    pageSize: AUDIT_PAGE_SIZE,
  });

  // Build a filter-preserving href for a target page (drives Prev / Next).
  const pageHref = (target: number) => {
    const sp = new URLSearchParams();
    if (tableName) sp.set("table", tableName);
    if (actionName) sp.set("action", actionName);
    if (actorEmail) sp.set("actor", actorEmail);
    if (rowId) sp.set("row", rowId);
    if (target > 1) sp.set("page", String(target));
    const qs = sp.toString();
    return qs ? `/admin/audit?${qs}` : "/admin/audit";
  };

  const firstRow = entries.length === 0 ? 0 : offset + 1;
  const lastRow = offset + entries.length;

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
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Actor email
          <input
            type="search"
            name="actor"
            defaultValue={actorEmail ?? ""}
            placeholder="contains…"
            className={controlClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Row id
          <input
            type="search"
            name="row"
            defaultValue={rowId ?? ""}
            placeholder="contains…"
            className={controlClass}
          />
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
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/audit?actor=system%40dealstack.local">
            Pipeline events
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/audit?table=feed_items">Feed-item history</Link>
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {pageNum > 1
              ? "No more audit events on this page."
              : hasFilter
                ? "No audit events match these filters."
                : "No audit events recorded yet. New admin actions will appear here."}
          </p>
          {pageNum > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={pageHref(pageNum - 1)}>← Previous page</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <>
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

        {/* Offset-based pager — preserves the active filters across pages. */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            Showing {firstRow}–{lastRow}
          </p>
          <div className="flex items-center gap-2">
            {pageNum > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(pageNum - 1)}>Previous</Link>
              </Button>
            ) : null}
            <span className="px-1 text-xs text-muted-foreground tabular-nums">
              Page {pageNum}
            </span>
            {hasMore ? (
              <Button asChild variant="outline" size="sm">
                <Link href={pageHref(pageNum + 1)}>Next</Link>
              </Button>
            ) : null}
          </div>
        </div>
        </>
      )}
    </div>
  );
}
