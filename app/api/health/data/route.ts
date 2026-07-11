import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import { getPublishedDataHealth } from "@/lib/admin/repos/dataHealth";
import { reportServerError } from "@/lib/observability/report-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
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
    const health = await getPublishedDataHealth();
    return Response.json(health, {
      status: health.ok ? 200 : 503,
      headers: NO_STORE,
    });
  } catch (error) {
    await reportServerError({
      digest: "data-health-read",
      name: "DataHealthReadError",
      message: error instanceof Error ? error.message : "Unknown data health error",
      path: "/api/health/data",
      method: "GET",
      routePath: "/api/health/data",
      routeType: "route",
    });
    return Response.json(
      { ok: false, error: "Data health check failed." },
      { status: 503, headers: NO_STORE }
    );
  }
}

