import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
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
  { key: "terms", header: "Terms" },
  { key: "confidence", header: "Confidence" },
  { key: "status", header: "Status" },
];

// AU-local "today" as YYYY-MM-DD so it compares directly to expiry_date.
const TODAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" });

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

/** Minimum spend + annual fee, so these show for every offer type, not just annual_fee_discount. */
function termsSummary(offer: AdminCardOffer): string {
  const parts: string[] = [];
  if (offer.minimumSpend != null) {
    parts.push(`$${offer.minimumSpend.toLocaleString()} spend`);
  }
  // Already surfaced via the offer-type headline for this type — avoid repeating it.
  if (offer.annualFee != null && offer.offerType !== "annual_fee_discount") {
    parts.push(`$${offer.annualFee} p.a.`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function toRow(offer: AdminCardOffer, todayStr: string): AdminRow {
  const type = OFFER_TYPE_LABELS[offer.offerType];
  const isExpired = offer.expiryDate != null && offer.expiryDate < todayStr;
  return {
    id: offer.id,
    searchText: `${offer.provider} ${offer.cardName} ${type}`.toLowerCase(),
    filterValue: offer.isPublished ? "published" : "draft",
    editHref: `/admin/card-offers/${offer.id}/edit`,
    cells: {
      provider: { kind: "text", text: offer.provider, strong: true },
      card: { kind: "text", text: offer.cardName },
      type: { kind: "text", text: `${type} · ${bonusHeadline(offer)}` },
      terms: { kind: "text", text: termsSummary(offer), muted: true },
      confidence: { kind: "confidence", value: offer.confidence },
      status: {
        kind: "badges",
        items: [
          offer.isPublished
            ? { text: "Published", tone: "secondary" }
            : { text: "Draft", tone: "outline" },
          ...(isExpired ? [{ text: "Expired", tone: "amber" as const }] : []),
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

export default async function CardOfferListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const offers = await listCardOffers();
  const todayStr = TODAY_FMT.format(new Date());

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

      <div className="w-full rounded-r-md border-l-4 border-amber-500 bg-amber-50/50 p-3 dark:bg-amber-950/25">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-400">
              Verify before publishing
            </p>
            <p className="text-[11px] leading-normal text-muted-foreground/80">
              Publishing does not re-check anything automatically — before you
              publish a draft, re-open it and confirm the bonus, fee, minimum
              spend and eligibility still match the bank&rsquo;s own current
              page.
            </p>
          </div>
        </div>
      </div>

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
          rows={offers.map((offer) => toRow(offer, todayStr))}
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
