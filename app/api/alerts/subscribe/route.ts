import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { emailAlertTokenSecret, emailAlertsPublicEnabled, siteUrl } from "@/lib/env";
import { requestEmailAlert } from "@/lib/alerts/repo";
import { hashAlertToken, newAlertToken, normaliseAlertBaseUrl, parseAlertRequest } from "@/lib/alerts/validation";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 2048;

function fingerprint(request: NextRequest, secret: string): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const agent = request.headers.get("user-agent")?.slice(0, 200) ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${day}|${ip}|${agent}`).digest("hex");
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!emailAlertsPublicEnabled()) return Response.json({ error: "Email alerts are not enabled yet." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });
  try {
    const raw = await request.text();
    if (!raw || raw.length > MAX_BODY_BYTES) return Response.json({ error: "Request is too large." }, { status: 413 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.website) return new Response(null, { status: 204 });
    const parsed = parseAlertRequest(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const secret = emailAlertTokenSecret();
    const confirmToken = newAlertToken();
    const base = normaliseAlertBaseUrl(siteUrl());
    if (!base) {
      return Response.json(
        { error: "Email alerts are not safely configured." },
        { status: 503 }
      );
    }
    const result = await requestEmailAlert({
      email: parsed.email,
      criteria: parsed.criteria,
      confirmationTokenHash: hashAlertToken(confirmToken, secret),
      requestFingerprint: fingerprint(request, secret),
      confirmationUrl: `${base}/api/alerts/confirm?token=${encodeURIComponent(confirmToken)}`,
      baseUrl: base,
    });
    if (result === "rate-limited") return Response.json({ error: "Too many requests. Try again tomorrow." }, { status: 429 });
    // Identical response for queued and already-active avoids account probing.
    return Response.json({ ok: true, message: "If this alert is new, a confirmation email will arrive shortly." }, { status: 202 });
  } catch (error) {
    console.error("[email-alerts] subscription request failed:", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Could not request this alert." }, { status: 500 });
  }
}
