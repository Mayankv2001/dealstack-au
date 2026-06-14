import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listCashbackOffers,
  type AdminCashbackOffer,
} from "@/lib/admin/repos/cashback";
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
  title: "Cashback offers | DealStack AU admin",
};

/** Human-readable rate / flat-amount summary for the list. */
function formatRate(offer: AdminCashbackOffer): string {
  const parts: string[] = [];
  if (offer.ratePercent) parts.push(`${offer.ratePercent}%`);
  if (offer.flatAmount != null) parts.push(`$${offer.flatAmount}`);
  return parts.length > 0 ? parts.join(" + ") : "—";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-medium">
                  {offer.storeName ?? offer.merchantId}
                </TableCell>
                <TableCell>{offer.provider}</TableCell>
                <TableCell>{formatRate(offer)}</TableCell>
                <TableCell>
                  <ConfidenceBadge confidence={offer.confidence} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {offer.isPublished ? (
                      <Badge variant="secondary">Published</Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                    {offer.isUpsized ? (
                      <Badge variant="outline">Upsized</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/cashback/${offer.id}/edit`}>Edit</Link>
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
