import { timingSafeEqual } from "node:crypto";
import { claimAlertOutbox, markAlertSent, pruneAlertData, queueCurrentAlertMessages, returnAlertForRetry } from "@/lib/alerts/repo";
import { deliverAlertEmail } from "@/lib/alerts/delivery";
import { cronSecret, emailAlertDeliveryEnabled, emailAlertsEnabled, emailDeliveryWebhookToken, emailDeliveryWebhookUrl, siteUrl } from "@/lib/env";
import { todayAU } from "@/lib/offers/expiry";
import { reportOperationalError } from "@/lib/observability/report-server-error";
import { normaliseAlertBaseUrl } from "@/lib/alerts/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET is not configured." }, { status: 503 });
  if (!authorized(request.headers.get("authorization"), secret)) return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  if (!emailAlertsEnabled() || !emailAlertDeliveryEnabled()) return Response.json({ ok: true, ran: false, skipped: "disabled" });
  const endpoint = emailDeliveryWebhookUrl();
  if (!endpoint) return Response.json({ ok: false, ran: false, error: "Email delivery endpoint is not configured." }, { status: 503 });
  const baseUrl = normaliseAlertBaseUrl(siteUrl());
  if (!baseUrl) return Response.json({ ok: false, ran: false, error: "Public alert links are not safely configured." }, { status: 503 });
  try {
    const queued = await queueCurrentAlertMessages(todayAU(), baseUrl);
    const claimed = await claimAlertOutbox(25);
    let sent = 0;
    let failed = 0;
    for (const row of claimed) {
      try {
        await deliverAlertEmail(row, { endpoint, token: emailDeliveryWebhookToken() });
        await markAlertSent(row);
        sent += 1;
      } catch (error) {
        failed += 1;
        await returnAlertForRetry(row, error instanceof Error ? error.message : "Unknown delivery failure");
      }
    }
    await pruneAlertData();
    return Response.json({ ok: failed === 0, ran: true, queued, claimed: claimed.length, sent, failed });
  } catch (error) {
    await reportOperationalError("email-alert-delivery", error);
    return Response.json({ ok: false, ran: true, error: "Email alert delivery failed." }, { status: 500 });
  }
}
