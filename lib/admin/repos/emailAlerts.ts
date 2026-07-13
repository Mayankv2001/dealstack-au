import { getSupabaseAdmin } from "@/lib/supabase/admin";

type UntypedTable = "stores";
const table = (name: string) => getSupabaseAdmin().from(name as UntypedTable);

export interface AdminEmailAlertSubscription {
  id: string;
  email: string;
  criteria_kind: string;
  criteria_key: string | null;
  status: string;
  requested_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
  last_sent_at: string | null;
}

export interface AdminEmailAlertOutbox {
  id: string;
  subscription_id: string;
  message_kind: string;
  recipient_email: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
}

export async function listAdminEmailAlerts(): Promise<{ available: boolean; subscriptions: AdminEmailAlertSubscription[]; outbox: AdminEmailAlertOutbox[] }> {
  const [subscriptions, outbox] = await Promise.all([
    table("email_alert_subscriptions").select("id, email, criteria_kind, criteria_key, status, requested_at, confirmed_at, unsubscribed_at, last_sent_at").order("requested_at", { ascending: false }).limit(200),
    table("email_alert_outbox").select("id, subscription_id, message_kind, recipient_email, status, attempts, next_attempt_at, sent_at, last_error, created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const missing = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";
  if (missing(subscriptions.error) || missing(outbox.error)) return { available: false, subscriptions: [], outbox: [] };
  if (subscriptions.error) throw new Error(subscriptions.error.message);
  if (outbox.error) throw new Error(outbox.error.message);
  return { available: true, subscriptions: (subscriptions.data ?? []) as unknown as AdminEmailAlertSubscription[], outbox: (outbox.data ?? []) as unknown as AdminEmailAlertOutbox[] };
}

export async function adminUnsubscribeEmailAlert(id: string): Promise<void> {
  const changed = await table("email_alert_subscriptions").update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() } as never).eq("id", id).filter("status", "in", "(pending,active)");
  if (changed.error) throw new Error(changed.error.message);
  const cancelled = await table("email_alert_outbox").update({ status: "cancelled" } as never).filter("subscription_id", "eq", id).filter("status", "in", "(pending,sending)");
  if (cancelled.error) throw new Error(cancelled.error.message);
}
