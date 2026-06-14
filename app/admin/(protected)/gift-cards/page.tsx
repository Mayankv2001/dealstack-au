import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listGiftCardOffers,
  type AdminGiftCardOffer,
} from "@/lib/admin/repos/giftCards";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
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
import { setPublished } from "./actions";

export const metadata: Metadata = {
  title: "Gift card offers | DealStack AU admin",
};

const CHANNEL_LABELS: Record<AdminGiftCardOffer["channel"], string> = {
  "membership-portal": "Membership portal",
  "supermarket-promo": "Supermarket promo",
  "bank-benefit": "Bank benefit",
};

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
        <Button asChild>
          <Link href="/admin/gift-cards/new">New offer</Link>
        </Button>
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Brand</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-medium">{offer.brand}</TableCell>
                <TableCell>{CHANNEL_LABELS[offer.channel]}</TableCell>
                <TableCell>
                  {offer.discountPercent ? `${offer.discountPercent}%` : "—"}
                </TableCell>
                <TableCell>{offer.source}</TableCell>
                <TableCell>
                  <ConfidenceBadge confidence={offer.confidence} />
                </TableCell>
                <TableCell>
                  {offer.isPublished ? (
                    <Badge variant="secondary">Published</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/gift-cards/${offer.id}/edit`}>Edit</Link>
                    </Button>
                    {/* POST form so the bound server action toggles published. */}
                    <form action={setPublished.bind(null, offer.id, !offer.isPublished)}>
                      <Button type="submit" variant="outline" size="sm">
                        {offer.isPublished ? "Unpublish" : "Publish"}
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
