import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listGiftCardOffers,
  type AdminGiftCardOffer,
} from "@/lib/admin/repos/giftCards";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Gift card offers | DealStack AU admin",
};

const CHANNEL_LABELS: Record<AdminGiftCardOffer["channel"], string> = {
  "membership-portal": "Membership portal",
  "supermarket-promo": "Supermarket promo",
  "bank-benefit": "Bank benefit",
};

const COLUMNS: AdminColumn[] = [
  { key: "brand", header: "Brand" },
  { key: "channel", header: "Channel" },
  { key: "discount", header: "Discount" },
  { key: "source", header: "Source" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

function toRow(offer: AdminGiftCardOffer): AdminRow {
  const channel = CHANNEL_LABELS[offer.channel];
  return {
    id: offer.id,
    searchText: `${offer.brand} ${channel} ${offer.source}`.toLowerCase(),
    filterValue: offer.isPublished ? "published" : "draft",
    editHref: `/admin/gift-cards/${offer.id}/edit`,
    cells: {
      brand: { kind: "text", text: offer.brand, strong: true },
      channel: { kind: "text", text: channel },
      discount: {
        kind: "text",
        text: offer.discountPercent ? `${offer.discountPercent}%` : "—",
      },
      source: { kind: "text", text: offer.source },
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

export default async function GiftCardListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const offers = await listGiftCardOffers();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Gift card offers</h1>
          <p className="text-sm text-muted-foreground">
            Manual entry. Drafts are listed here but hidden from /deals until
            published.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/gift-cards/review">Review queue</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/gift-cards/new">New offer</Link>
          </Button>
        </div>
      </header>

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No gift card offers yet.{" "}
          <Link href="/admin/gift-cards/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={offers.map(toRow)}
          searchPlaceholder="Search brand, channel, source…"
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
