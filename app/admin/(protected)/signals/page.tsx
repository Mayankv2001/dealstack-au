import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listSignals, type AdminSignal } from "@/lib/admin/repos/signals";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
  type AdminRowAction,
  type CellTone,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { approveSelectedSignals, setStatus } from "./actions";

export const metadata: Metadata = {
  title: "OzBargain signals | DealStack AU admin",
};

const DEAL_KIND_LABELS: Record<AdminSignal["dealKind"], string> = {
  "discount-code": "Discount code",
  cashback: "Cashback",
  "gift-card": "Gift card",
  points: "Points",
  guide: "Guide",
  card: "Card",
};

const STATUS_TONES: Record<AdminSignal["status"], CellTone> = {
  approved: "secondary",
  pending: "outline",
  expired: "outline",
  hidden: "destructive",
};

const STATUS_LABELS: Record<AdminSignal["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
  expired: "Expired",
};

const COLUMNS: AdminColumn[] = [
  { key: "title", header: "Title" },
  { key: "store", header: "Store" },
  { key: "kind", header: "Kind" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

function toRow(signal: AdminSignal): AdminRow {
  const store = signal.storeName ?? "—";
  const kind = DEAL_KIND_LABELS[signal.dealKind];
  const actions: AdminRowAction[] = [];
  if (signal.status !== "approved") {
    actions.push({
      action: setStatus.bind(null, signal.id, "approved"),
      label: "Approve",
    });
  }
  if (signal.status !== "hidden") {
    actions.push({
      action: setStatus.bind(null, signal.id, "hidden"),
      label: "Hide",
    });
  }
  return {
    id: signal.id,
    searchText:
      `${signal.title} ${store} ${kind} ${STATUS_LABELS[signal.status]}`.toLowerCase(),
    filterValue: signal.status,
    // Bulk approve targets not-yet-approved signals only (same rule as the
    // per-row Approve button).
    selectable: signal.status !== "approved",
    editHref: `/admin/signals/${signal.id}/edit`,
    cells: {
      title: { kind: "text", text: signal.title, strong: true },
      store: signal.storeName
        ? { kind: "text", text: signal.storeName }
        : { kind: "text", text: "—", muted: true },
      kind: { kind: "text", text: kind },
      confidence: { kind: "confidence", value: signal.confidence },
      status: {
        kind: "badges",
        items: [
          {
            text: STATUS_LABELS[signal.status],
            tone: STATUS_TONES[signal.status],
          },
          ...(signal.isSample
            ? [{ text: "Sample", tone: "outline" as const }]
            : []),
        ],
      },
    },
    actions,
  };
}

export default async function SignalsListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const signals = await listSignals();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">OzBargain signals</h1>
          <p className="text-sm text-muted-foreground">
            Manual entry — no OzBargain fetching. Only approved signals show on
            /deals; pending, hidden and expired are listed here for moderation.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/signals/new">New signal</Link>
        </Button>
      </header>

      {signals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No signals yet.{" "}
          <Link href="/admin/signals/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={signals.map(toRow)}
          searchPlaceholder="Search title, store, kind…"
          filter={{
            label: "Status",
            options: [
              { value: "pending", label: "Pending" },
              { value: "approved", label: "Approved" },
              { value: "hidden", label: "Hidden" },
              { value: "expired", label: "Expired" },
            ],
          }}
          bulk={{
            run: approveSelectedSignals,
            label: "Approve selected",
            max: 200,
            confirmBody:
              "Approved signals become PUBLIC on /deals and the homepage Top 5 " +
              "immediately. Untick anything you have not reviewed before confirming.",
          }}
        />
      )}
    </div>
  );
}
