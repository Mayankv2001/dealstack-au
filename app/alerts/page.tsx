import type { Metadata } from "next";
import EmailAlertForm from "@/components/EmailAlertForm";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { emailAlertsPublicEnabled } from "@/lib/env";

export const metadata: Metadata = { title: "Email alerts | DealStack AU", description: "Double-opt-in email alerts for reviewed DealStack stores, gift-card brands, rewards programmes and expiring offers." };
export const dynamic = "force-dynamic";

type Params = { status?: string | string[] };

const STATUS: Record<string, string> = {
  confirmed: "Your alert is confirmed.",
  unsubscribed: "You have been unsubscribed from this alert.",
  invalid: "This link is invalid or has already been used.",
  unavailable: "Alert preferences are temporarily unavailable. Please try again later.",
};

export default async function AlertsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const raw = (await searchParams).status;
  const status = Array.isArray(raw) ? raw[0] : raw;
  const enabled = emailAlertsPublicEnabled();
  return <div className="flex min-h-screen flex-col bg-emerald-500/[0.04]"><SiteHeader /><main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6"><h1 className="text-3xl font-bold tracking-tight">Email alerts</h1><p className="mt-3 text-muted-foreground">Follow a store, gift-card brand or rewards programme—or ask for reviewed offers that are close to expiry.</p>{status && STATUS[status] ? <p role="status" className="mt-5 rounded-lg border bg-card p-3 text-sm font-medium">{STATUS[status]}</p> : null}{enabled ? <EmailAlertForm /> : <Card className="mt-6"><CardContent className="p-6"><h2 className="font-semibold">Alerts are not enabled yet</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">The double-opt-in and unsubscribe workflow is prepared, but subscriptions stay closed until reviewed production data, the privacy check and the email-delivery provider are approved.</p></CardContent></Card>}<section className="mt-8 rounded-2xl border bg-card p-5"><h2 className="font-semibold">Privacy and control</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Email only; no public DealStack account is required.</li><li>Alerts begin only after you confirm the link sent to your address.</li><li>Each message contains a direct unsubscribe link.</li><li>Alert data is not used for advertising profiles.</li></ul></section></main><SiteFooter /></div>;
}
