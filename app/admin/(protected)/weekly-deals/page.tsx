import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listWeeklyDeals,
  type AdminWeeklyDeal,
} from "@/lib/admin/repos/weeklyDeals";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Weekly deals | DealStack AU admin",
};

const HIGHLIGHT_LABELS: Record<AdminWeeklyDeal["highlight"], string> = {
  "best-stack": "Best stack",
  "gift-card": "Gift card",
  points: "Points",
  cashback: "Cashback",
  signal: "Signal",
  "needs-verification": "Needs verification",
};

const COLUMNS: AdminColumn[] = [
  { key: "weekOf", header: "Week of" },
  { key: "title", header: "Title" },
  { key: "store", header: "Store" },
  { key: "highlight", header: "Highlight" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

function toRow(deal: AdminWeeklyDeal): AdminRow {
  const store = deal.storeName ?? "—";
  const highlight = HIGHLIGHT_LABELS[deal.highlight];
  return {
    id: deal.id,
    searchText: `${deal.weekOf} ${deal.title} ${store} ${highlight}`.toLowerCase(),
    filterValue: deal.isPublished ? "published" : "draft",
    editHref: `/admin/weekly-deals/${deal.id}/edit`,
    cells: {
      weekOf: { kind: "text", text: deal.weekOf, strong: true },
      title: { kind: "text", text: deal.title },
      store: deal.storeName
        ? { kind: "text", text: deal.storeName }
        : { kind: "text", text: "—", muted: true },
      highlight: { kind: "text", text: highlight },
      confidence: { kind: "confidence", value: deal.confidence },
      status: {
        kind: "badge",
        text: deal.isPublished ? "Published" : "Draft",
        tone: deal.isPublished ? "secondary" : "outline",
      },
    },
    actions: [
      {
        action: setPublished.bind(null, deal.id, !deal.isPublished),
        label: deal.isPublished ? "Unpublish" : "Publish",
      },
    ],
  };
}

export default async function WeeklyDealsListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const deals = await listWeeklyDeals();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Weekly deals</h1>
          <p className="text-sm text-muted-foreground">
            Curated editorial cards that reference existing offer ids. Drafts are
            listed here but hidden from /deals until published.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/weekly-deals/new">New weekly deal</Link>
        </Button>
      </header>

      {deals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No weekly deals yet.{" "}
          <Link href="/admin/weekly-deals/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={deals.map(toRow)}
          searchPlaceholder="Search title, store, highlight…"
          filter={{
            label: "Status",
            options: [
              { value: "published", label: "Published" },
              { value: "draft", label: "Draft" },
            ],
          }}
        />
      )}
    </div>
  );
}
