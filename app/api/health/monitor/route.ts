import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import { getMonitorHealthSnapshot } from "@/lib/admin/repos/monitorStatus";
import { deriveMonitorHealth } from "@/lib/monitor/health";
import { reportOperationalError } from "@/lib/observability/report-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

// Kept in sync with the cron route so this addition cannot alter its auth gate.
function isAuthorized(header: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!header || !header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503, headers: NO_STORE }
    );
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json(
      { ok: false, error: "Unauthorized." },
      { status: 401, headers: NO_STORE }
    );
  }

  try {
    const snapshot = await getMonitorHealthSnapshot();
    const health = deriveMonitorHealth({ ...snapshot, now: new Date() });
    if (!health.ok) {
      await reportOperationalError(
        `monitor-health-${health.reason}`,
        "detail" in health ? health.detail : health.reason
      );
    }
    return Response.json(health, {
      status: health.ok ? 200 : 503,
      headers: NO_STORE,
    });
  } catch (err) {
    await reportOperationalError("monitor-health-read", err);
    return Response.json(
      { ok: false, error: "Health check failed." },
      { status: 503, headers: NO_STORE }
    );
  }
}
