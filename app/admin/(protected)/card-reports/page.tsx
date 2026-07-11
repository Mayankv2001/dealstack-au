import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listCardOfferCorrectionReports } from "@/lib/admin/repos/cardReports";
import { ActionButton } from "@/components/admin/ActionButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { resolveCardReport } from "./actions";

export const metadata: Metadata = { title: "Card corrections | DealStack AU admin" };

const DATE = new Intl.DateTimeFormat("en-AU", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Australia/Melbourne",
});

export default async function CardReportsPage() {
  await requireAdmin();
  const reports = await listCardOfferCorrectionReports();
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Card correction reports</h1><p className="mt-1 text-sm text-muted-foreground">Reader reports are private review inputs. They never change public content automatically.</p></header>
      {reports.length === 0 ? <p className="border-y py-8 text-center text-sm text-muted-foreground">No correction reports.</p> : (
        <div className="space-y-3">
          {reports.map((report) => (
            <article key={report.id} className="rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><div className="flex items-center gap-2"><h2 className="font-semibold">{report.offerLabel}</h2><Badge variant="outline">{report.reason}</Badge><Badge variant={report.status === "new" ? "destructive" : "secondary"}>{report.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Submitted {DATE.format(new Date(report.createdAt))}</p></div>
                {report.cardOfferId ? <Button asChild variant="outline" size="sm"><Link href={`/admin/card-offers/${report.cardOfferId}/edit`}>Open offer</Link></Button> : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{report.details}</p>
              {report.status === "new" ? <div className="mt-4 flex gap-2 border-t pt-3"><ActionButton run={resolveCardReport.bind(null, report.id, "reviewed")}>Mark reviewed</ActionButton><ActionButton run={resolveCardReport.bind(null, report.id, "dismissed")} variant="ghost">Dismiss</ActionButton></div> : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

