import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listPointsOffers,
  type AdminPointsOffer,
} from "@/lib/admin/repos/points";
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
  title: "Points offers | DealStack AU admin",
};

const MECHANISM_LABELS: Record<AdminPointsOffer["mechanism"], string> = {
  "in-store-boost": "In-store boost",
  "card-linked": "Card-linked",
  "shopping-portal": "Shopping portal",
  "base-earn": "Base earn",
};

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Program</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Mechanism</TableHead>
              <TableHead>Rate</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-medium">{offer.program}</TableCell>
                <TableCell>
                  {offer.storeName ?? (
                    <span className="text-muted-foreground">Program-wide</span>
                  )}
                </TableCell>
                <TableCell>{MECHANISM_LABELS[offer.mechanism]}</TableCell>
                <TableCell>{offer.earnRateDisplay || "—"}</TableCell>
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
                      <Link href={`/admin/points/${offer.id}/edit`}>Edit</Link>
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
