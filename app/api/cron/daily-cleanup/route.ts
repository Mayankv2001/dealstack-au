import { timingSafeEqual } from "node:crypto";
import { cronSecret } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayAU } from "@/lib/offers/expiry";
import { revalidatePath } from "next/cache";
import { reportOperationalError } from "@/lib/observability/report-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Daily offer-expiry cleanup cron.
 *
 * Calls `run_daily_cleanup` (migration 038), which unpublishes published
 * gift-card / cashback / points / weekly rows whose expiry_date has passed and
 * archives card offers past their expiry or review-by date, writing one
 * audit_log row per change. It NEVER deletes and NEVER publishes.
 *
 * This is purely internal: no outbound requests, no external sources, no
 * staging. It talks only to our own Supabase project.
 *
 * Dates use the Australia/Sydney calendar, so a row expiring *today* is not yet
 * expired — the same inclusive boundary the public read path and the RLS
 * policies use.
 */

/** Public surfaces an unpublish/archive affects. Over-revalidation is harmless. */
function revalidatePublicOffers(): void {
  revalidatePath("/");
  revalidatePath("/deals");
  revalidatePath("/search");
  revalidatePath("/cards");
  revalidatePath("/stores");
}

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc("run_daily_cleanup", {
      p_today: todayAU(now),
      p_archived_at: now.toISOString(),
    });
    if (error) throw new Error(error.message);

    const summary = (data ?? {}) as {
      expiredOffers?: number;
      cardOffers?: number;
    };
    // Only evict caches when something actually changed.
    if ((summary.expiredOffers ?? 0) + (summary.cardOffers ?? 0) > 0) {
      revalidatePublicOffers();
    }
    return Response.json({ ok: true, ran: true, ...summary });
  } catch (error) {
    await reportOperationalError("daily-cleanup", error);
    return Response.json(
      { ok: false, ran: false, error: "daily cleanup failed" },
      { status: 500 },
    );
  }
}
