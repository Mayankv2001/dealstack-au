import { NextRequest } from "next/server";
import { emailAlertTokenSecret, siteUrl } from "@/lib/env";
import { unsubscribeEmailAlert } from "@/lib/alerts/repo";
import { hashAlertToken } from "@/lib/alerts/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const destination = new URL("/alerts", siteUrl());
  if (token.length < 32 || token.length > 100) {
    destination.searchParams.set("status", "invalid");
    return Response.redirect(destination, 303);
  }
  try {
    const removed = await unsubscribeEmailAlert(hashAlertToken(token, emailAlertTokenSecret()));
    destination.searchParams.set("status", removed ? "unsubscribed" : "invalid");
  } catch {
    destination.searchParams.set("status", "unavailable");
  }
  return Response.redirect(destination, 303);
}
