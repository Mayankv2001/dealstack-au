import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  listWeeklyDeals,
  type AdminWeeklyDeal,
} from "@/lib/admin/repos/weeklyDeals";
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week of</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Highlight</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {deals.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  {deal.weekOf}
                </TableCell>
                <TableCell className="max-w-xs">
                  <span className="line-clamp-2">{deal.title}</span>
                </TableCell>
                <TableCell>
                  {deal.storeName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{HIGHLIGHT_LABELS[deal.highlight]}</TableCell>
                <TableCell>
                  <ConfidenceBadge confidence={deal.confidence} />
                </TableCell>
                <TableCell>
                  {deal.isPublished ? (
                    <Badge variant="secondary">Published</Badge>
                  ) : (
                    <Badge variant="outline">Draft</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/weekly-deals/${deal.id}/edit`}>Edit</Link>
                    </Button>
                    {/* POST form so the bound server action toggles published. */}
                    <form action={setPublished.bind(null, deal.id, !deal.isPublished)}>
                      <Button type="submit" variant="outline" size="sm">
                        {deal.isPublished ? "Unpublish" : "Publish"}
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
