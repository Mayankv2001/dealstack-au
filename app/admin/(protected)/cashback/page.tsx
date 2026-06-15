import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listCashbackOffers,
  type AdminCashbackOffer,
} from "@/lib/admin/repos/cashback";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Cashback offers | DealStack AU admin",
};

const COLUMNS: AdminColumn[] = [
  { key: "store", header: "Store" },
  { key: "provider", header: "Provider" },
  { key: "rate", header: "Rate" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

/** Human-readable rate / flat-amount summary for the list. */
function formatRate(offer: AdminCashbackOffer): string {
  const parts: string[] = [];
  if (offer.ratePercent) parts.push(`${offer.ratePercent}%`);
  if (offer.flatAmount != null) parts.push(`$${offer.flatAmount}`);
  return parts.length > 0 ? parts.join(" + ") : "—";
}

function toRow(offer: AdminCashbackOffer): AdminRow {
  const store = offer.storeName ?? offer.merchantId;
  const rate = formatRate(offer);
  return {
    id: offer.id,
    searchText: `${store} ${offer.provider} ${rate}`.toLowerCase(),
    filterValue: offer.isPublished ? "published" : "draft",
    editHref: `/admin/cashback/${offer.id}/edit`,
    cells: {
      store: { kind: "text", text: store, strong: true },
      provider: { kind: "text", text: offer.provider },
      rate: { kind: "text", text: rate },
      confidence: { kind: "confidence", value: offer.confidence },
      status: {
        kind: "badges",
        items: [
          offer.isPublished
            ? { text: "Published", tone: "secondary" }
            : { text: "Draft", tone: "outline" },
          ...(offer.isUpsized
            ? [{ text: "Upsized", tone: "outline" as const }]
            : []),
        ],
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

export default async function CashbackListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const offers = await listCashbackOffers();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Cashback offers</h1>
          <p className="text-sm text-muted-foreground">
            ShopBack &amp; TopCashback only — manual entry. Drafts are listed here
            but hidden from /deals until published.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/cashback/new">New offer</Link>
        </Button>
      </header>

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No cashback offers yet.{" "}
          <Link href="/admin/cashback/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={offers.map(toRow)}
          searchPlaceholder="Search store, provider, rate…"
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
