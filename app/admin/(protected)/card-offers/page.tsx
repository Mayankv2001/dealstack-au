import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listCardOffers, type AdminCardOffer } from "@/lib/admin/repos/cardOffers";
import {
  AdminListTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminListTable";
import { Button } from "@/components/ui/button";
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Card offers | DealStack AU admin",
};

const OFFER_TYPE_LABELS: Record<AdminCardOffer["offerType"], string> = {
  sign_up_bonus: "Sign-up bonus",
  cashback: "Cashback",
  statement_credit: "Statement credit",
  points_bonus: "Points bonus",
  annual_fee_discount: "Annual fee discount",
};

const COLUMNS: AdminColumn[] = [
  { key: "provider", header: "Provider" },
  { key: "card", header: "Card" },
  { key: "type", header: "Offer type" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

/** Best available headline value for the offer type, for a compact list view. */
function bonusHeadline(offer: AdminCardOffer): string {
  switch (offer.offerType) {
    case "sign_up_bonus":
    case "points_bonus":
      return offer.bonusPoints != null ? `${offer.bonusPoints.toLocaleString()} pts` : "—";
    case "cashback":
      return offer.cashbackAmount != null ? `$${offer.cashbackAmount}` : "—";
    case "statement_credit":
      return offer.statementCreditAmount != null
        ? `$${offer.statementCreditAmount}`
        : "—";
    case "annual_fee_discount":
      return offer.annualFee != null ? `$${offer.annualFee} fee` : "—";
    default:
      return "—";
  }
}

function toRow(offer: AdminCardOffer): AdminRow {
  const type = OFFER_TYPE_LABELS[offer.offerType];
  return {
    id: offer.id,
    searchText: `${offer.provider} ${offer.cardName} ${type}`.toLowerCase(),
    filterValue: offer.isPublished ? "published" : "draft",
    editHref: `/admin/card-offers/${offer.id}/edit`,
    cells: {
      provider: { kind: "text", text: offer.provider, strong: true },
      card: { kind: "text", text: offer.cardName },
      type: { kind: "text", text: `${type} · ${bonusHeadline(offer)}` },
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

export default async function CardOfferListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const offers = await listCardOffers();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Card offers</h1>
          <p className="text-sm text-muted-foreground">
            Manual entry only — bank/card-issuer sign-up bonuses and cashback.
            Drafts require an explicit publish before they can appear anywhere
            public.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/card-offers/new">New offer</Link>
        </Button>
      </header>

      {offers.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No card offers yet.{" "}
          <Link href="/admin/card-offers/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <AdminListTable
          columns={COLUMNS}
          rows={offers.map(toRow)}
          searchPlaceholder="Search provider, card, offer type…"
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
