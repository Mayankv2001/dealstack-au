"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ActionButton } from "@/components/admin/ActionButton";
import type { AdminActionResult } from "@/lib/admin/rate-limit";
import type { Confidence } from "@/lib/sources/types";
import { cn } from "@/lib/utils";

/**
 * Reusable admin list — client island for search + filter + responsive layout.
 *
 * The server page (which owns the service-role data fetch) maps its rows into
 * the serialisable shape below and passes them in, plus any per-row bound server
 * actions for the Edit/toggle buttons. This component adds a client-side text
 * search and an optional status filter, and renders a table on desktop / stacked
 * cards on mobile. No data fetching happens here.
 */

export type CellTone =
  | "secondary"
  | "outline"
  | "destructive"
  | "emerald"
  | "amber"
  | "muted";

export type AdminCell =
  | { kind: "text"; text: string; strong?: boolean; muted?: boolean; mono?: boolean }
  | { kind: "badge"; text: string; tone: CellTone }
  | { kind: "badges"; items: { text: string; tone: CellTone }[] }
  | { kind: "confidence"; value: Confidence };

export interface AdminColumn {
  key: string;
  header: string;
  align?: "right";
}

export interface AdminRowAction {
  /** Bound server action returning a typed result (e.g. the rate-limit error). */
  action: () => Promise<AdminActionResult>;
  label: string;
}

export interface AdminRow {
  id: string;
  /** Lowercased haystack the search box matches against. */
  searchText: string;
  /** Value the optional filter dropdown matches ("" = always shown). */
  filterValue?: string;
  editHref?: string;
  cells: Record<string, AdminCell>;
  actions?: AdminRowAction[];
}

export interface AdminFilter {
  label: string;
  /** Excludes the implicit "All" entry, which the component adds. */
  options: { value: string; label: string }[];
}

interface AdminListTableProps {
  columns: AdminColumn[];
  rows: AdminRow[];
  searchPlaceholder?: string;
  filter?: AdminFilter;
}

function toneToBadge(tone: CellTone): {
  variant: "secondary" | "outline" | "destructive";
  className?: string;
} {
  switch (tone) {
    case "secondary":
      return { variant: "secondary" };
    case "destructive":
      return { variant: "destructive" };
    case "emerald":
      return {
        variant: "outline",
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    case "amber":
      return {
        variant: "outline",
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    case "muted":
      return { variant: "outline", className: "text-muted-foreground" };
    case "outline":
    default:
      return { variant: "outline" };
  }
}

function CellView({ cell }: { cell: AdminCell | undefined }) {
  if (!cell) return <span className="text-muted-foreground">—</span>;
  if (cell.kind === "confidence") {
    return <ConfidenceBadge confidence={cell.value} />;
  }
  if (cell.kind === "badge") {
    const b = toneToBadge(cell.tone);
    return (
      <Badge variant={b.variant} className={b.className}>
        {cell.text}
      </Badge>
    );
  }
  if (cell.kind === "badges") {
    return (
      <div className="flex flex-wrap items-center gap-1">
        {cell.items.map((item, i) => {
          const b = toneToBadge(item.tone);
          return (
            <Badge key={i} variant={b.variant} className={b.className}>
              {item.text}
            </Badge>
          );
        })}
      </div>
    );
  }
  return (
    <span
      className={cn(
        cell.strong && "font-medium",
        cell.muted && "text-muted-foreground",
        cell.mono && "font-mono text-xs"
      )}
    >
      {cell.text}
    </span>
  );
}

function RowActions({ row }: { row: AdminRow }) {
  // One shared error line per row — set when a toggle returns { error }
  // (e.g. the rate-limit message), so nothing is thrown and no 500 occurs.
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-1">
        {row.editHref ? (
          <Button asChild variant="ghost" size="sm">
            <Link href={row.editHref}>Edit</Link>
          </Button>
        ) : null}
        {(row.actions ?? []).map((action) => (
          <ActionButton
            key={action.label}
            run={action.action}
            onStart={() => setError(null)}
            onError={setError}
          >
            {action.label}
          </ActionButton>
        ))}
      </div>
      {error ? (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function AdminListTable({
  columns,
  rows,
  searchPlaceholder = "Search…",
  filter,
}: AdminListTableProps) {
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filterValue && row.filterValue !== filterValue) return false;
      if (q && !row.searchText.includes(q)) return false;
      return true;
    });
  }, [rows, query, filterValue]);

  const controlClass =
    "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
            aria-label="Search"
          />
        </div>
        {filter ? (
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            aria-label={filter.label}
            className={controlClass}
          >
            <option value="">All {filter.label.toLowerCase()}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No matches.
        </p>
      ) : (
        <>
          {/* Desktop: table. */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className={column.align === "right" ? "text-right" : undefined}
                    >
                      {column.header}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    {columns.map((column) => (
                      <TableCell
                        key={column.key}
                        className={cn(
                          "align-top",
                          column.align === "right" && "text-right"
                        )}
                      >
                        <CellView cell={row.cells[column.key]} />
                      </TableCell>
                    ))}
                    <TableCell className="align-top text-right">
                      <RowActions row={row} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: stacked cards. */}
          <div className="space-y-3 md:hidden">
            {filtered.map((row) => (
              <div
                key={row.id}
                className="space-y-2 rounded-lg border p-3 text-sm shadow-sm"
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="flex items-start justify-between gap-3"
                  >
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {column.header}
                    </span>
                    {/* div (not span) so badge groups, which render a div, nest validly. */}
                    <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 text-right break-words">
                      <CellView cell={row.cells[column.key]} />
                    </div>
                  </div>
                ))}
                <div className="border-t pt-2">
                  <RowActions row={row} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminListTable;
