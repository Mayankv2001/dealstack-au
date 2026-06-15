import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listPointsOffers,
  type AdminPointsOffer,
} from "@/lib/admin/repos/points";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Points offers | DealStack AU admin",
};

const MECHANISM_LABELS: Record<AdminPointsOffer["mechanism"], string> = {
  "in-store-boost": "In-store boost",
  "card-linked": "Card-linked",
  "shopping-portal": "Shopping portal",
  "base-earn": "Base earn",
};

const COLUMNS: AdminColumn[] = [
  { key: "program", header: "Program" },
  { key: "store", header: "Store" },
  { key: "mechanism", header: "Mechanism" },
  { key: "rate", header: "Rate" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

function toRow(offer: AdminPointsOffer): AdminRow {
  const store = offer.storeName ?? "Program-wide";
  const mechanism = MECHANISM_LABELS[offer.mechanism];
  const rate = offer.earnRateDisplay || "—";
  return {
    id: offer.id,
    searchText: `${offer.program} ${store} ${mechanism} ${rate}`.toLowerCase(),
    filterValue: offer.isPublished ? "published" : "draft",
    editHref: `/admin/points/${offer.id}/edit`,
    cells: {
      program: { kind: "text", text: offer.program, strong: true },
      store: offer.storeName
        ? { kind: "text", text: offer.storeName }
        : { kind: "text", text: "Program-wide", muted: true },
      mechanism: { kind: "text", text: mechanism },
      rate: { kind: "text", text: rate },
      confidence: { kind: "confidence", value: offer.confidence },
      status: {
        kind: "badge",
        text: offer.isPublished ? "Published" : "Draft",
        tone: offer.isPublished ? "secondary" : "outline",
      },
    },
    actions: [
      {
        action: setPublished.bind(null, offer.id, !offer.isPublished),
        label: offer.isPublished ? "Unpublish" : "Publish",
      },
    ],
  };
}

export default async function PointsListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const offers = await listPointsOffers();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Points offers</h1>
          <p className="text-sm text-muted-foreground">
            Manual entry. Drafts are listed here but hidden from /deals until
            published.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/points/new">New offer</Link>
        </Button>
      </header>

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No points offers yet.{" "}
          <Link href="/admin/points/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={offers.map(toRow)}
          searchPlaceholder="Search program, store, mechanism…"
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
