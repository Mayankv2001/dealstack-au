import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { listAuditLog } from "@/lib/admin/repos/audit";
import { Badge } from "@/components/ui/badge";
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

export default async function AuditLogPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const entries = await listAuditLog(100);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Recent admin actions, newest first. Logging starts going forward — past
          actions are not backfilled.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No audit events recorded yet. New admin actions will appear here.
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
