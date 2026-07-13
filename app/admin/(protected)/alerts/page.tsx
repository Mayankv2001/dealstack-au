import type { Metadata } from "next";
import { ActionButton } from "@/components/admin/ActionButton";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminEmailAlerts } from "@/lib/admin/repos/emailAlerts";
import { unsubscribeAlert } from "./actions";

export const metadata: Metadata = { title: "Email alerts | DealStack AU admin" };
export const dynamic = "force-dynamic";
const DATE = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Melbourne" });

export default async function AdminAlertsPage() {
  await requireAdmin();
  const data = await listAdminEmailAlerts();
  if (!data.available) return <div><h1 className="text-2xl font-semibold">Email alerts</h1><div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"><p className="font-semibold">Alert schema is awaiting approval.</p><p className="mt-1 text-muted-foreground">Migration 027 is not applied. Public subscription and delivery switches remain off.</p></div></div>;
  return <div className="space-y-8"><header><h1 className="text-2xl font-semibold">Email alerts</h1><p className="mt-1 text-sm text-muted-foreground">Private double-opt-in subscriptions and delivery state. No public account is created.</p></header><section><h2 className="text-lg font-semibold">Subscriptions</h2><div className="mt-3 space-y-2">{data.subscriptions.map((row) => <article key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4"><div><p className="font-medium">{row.email}</p><p className="text-sm text-muted-foreground">{row.criteria_kind}{row.criteria_key ? ` · ${row.criteria_key}` : ""}</p><p className="mt-1 text-xs text-muted-foreground">Requested {DATE.format(new Date(row.requested_at))}</p></div><div className="flex items-center gap-2"><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge>{row.status === "pending" || row.status === "active" ? <ActionButton run={unsubscribeAlert.bind(null, row.id)} confirm="Stop this subscription and cancel pending mail?" variant="outline">Unsubscribe</ActionButton> : null}</div></article>)}{data.subscriptions.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No alert subscriptions.</p> : null}</div></section><section><h2 className="text-lg font-semibold">Delivery outbox</h2><div className="mt-3 overflow-x-auto rounded-lg border"><table className="min-w-full text-left text-sm"><thead className="bg-muted/50 text-xs"><tr><th className="p-3">Recipient</th><th className="p-3">Kind</th><th className="p-3">Status</th><th className="p-3">Attempts</th><th className="p-3">Created</th><th className="p-3">Error</th></tr></thead><tbody className="divide-y">{data.outbox.map((row) => <tr key={row.id}><td className="p-3">{row.recipient_email}</td><td className="p-3">{row.message_kind}</td><td className="p-3">{row.status}</td><td className="p-3">{row.attempts}/5</td><td className="p-3">{DATE.format(new Date(row.created_at))}</td><td className="max-w-xs truncate p-3 text-xs text-muted-foreground">{row.last_error ?? "—"}</td></tr>)}</tbody></table></div></section></div>;
}
