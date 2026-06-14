import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listSignals, type AdminSignal } from "@/lib/admin/repos/signals";
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
import { setStatus } from "./actions";

export const metadata: Metadata = {
  title: "OzBargain signals | DealStack AU admin",
};

const DEAL_KIND_LABELS: Record<AdminSignal["dealKind"], string> = {
  "discount-code": "Discount code",
  cashback: "Cashback",
  "gift-card": "Gift card",
  points: "Points",
  guide: "Guide",
};

const STATUS_VARIANTS: Record<
  AdminSignal["status"],
  "secondary" | "outline" | "destructive"
> = {
  approved: "secondary",
  pending: "outline",
  expired: "outline",
  hidden: "destructive",
};

const STATUS_LABELS: Record<AdminSignal["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
  expired: "Expired",
};

export default async function SignalsListPage() {
  // Belt-and-suspenders gate — the protected layout already checks, but every
  // admin page verifies independently (the proxy is only an optimistic check).
  await requireAdmin();
  const signals = await listSignals();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">OzBargain signals</h1>
          <p className="text-sm text-muted-foreground">
            Manual entry — no OzBargain fetching. Only approved signals show on
            /deals; pending, hidden and expired are listed here for moderation.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/signals/new">New signal</Link>
        </Button>
      </header>

      {signals.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No signals yet.{" "}
          <Link href="/admin/signals/new" className="font-medium underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {signals.map((signal) => (
              <TableRow key={signal.id}>
                <TableCell className="max-w-xs font-medium">
                  <span className="line-clamp-2">{signal.title}</span>
                </TableCell>
                <TableCell>
                  {signal.storeName ?? (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>{DEAL_KIND_LABELS[signal.dealKind]}</TableCell>
                <TableCell>
                  <ConfidenceBadge confidence={signal.confidence} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={STATUS_VARIANTS[signal.status]}>
                      {STATUS_LABELS[signal.status]}
                    </Badge>
                    {signal.isSample ? (
                      <Badge variant="outline">Sample</Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/admin/signals/${signal.id}/edit`}>Edit</Link>
                    </Button>
                    {/* POST forms so the bound server action changes status. */}
                    {signal.status !== "approved" ? (
                      <form action={setStatus.bind(null, signal.id, "approved")}>
                        <Button type="submit" variant="outline" size="sm">
                          Approve
                        </Button>
                      </form>
                    ) : null}
                    {signal.status !== "hidden" ? (
                      <form action={setStatus.bind(null, signal.id, "hidden")}>
                        <Button type="submit" variant="outline" size="sm">
                          Hide
                        </Button>
                      </form>
                    ) : null}
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
