import { timingSafeEqual } from "node:crypto";
import { cronSecret, giftCardLifecycleEnabled } from "@/lib/env";
import {
  applyGiftCardLifecycle,
  failLifecycleRun,
  finishLifecycleRun,
  isGiftCardLifecycleSchemaUnavailable,
  lastSuccessfulLifecycleRunStart,
  startLifecycleRun,
} from "@/lib/admin/repos/giftCardLifecycle";
import { decideDailyLifecycleSchedule } from "@/lib/giftcards/schedule";
import { revalidateGiftCardLifecyclePaths } from "@/lib/giftcards/revalidateLifecycle";
import { reportOperationalError } from "@/lib/observability/report-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function safeReport(error: unknown): Promise<void> {
  try {
    await reportOperationalError("gift-card-lifecycle", error);
  } catch {
    // Observability must never mask lifecycle finalisation or a controlled 503.
  }
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
  if (!giftCardLifecycleEnabled()) {
    return Response.json({ ok: true, ran: false, skipped: "environment-disabled" });
  }

  const now = new Date();
  let runId: string | null = null;
  try {
    const lastSuccessful = await lastSuccessfulLifecycleRunStart();
    const force = new URL(request.url).searchParams.get("force") === "1";
    const schedule = decideDailyLifecycleSchedule(now, lastSuccessful, { force });
    if (!schedule.run) {
      return Response.json({
        ok: true,
        ran: false,
        skipped: schedule.reason,
        sydneyDate: schedule.localDate,
      });
    }

    const lock = await startLifecycleRun(now);
    if (!lock.started) {
      return Response.json({ ok: true, ran: false, skipped: lock.reason });
    }
    runId = lock.runId;

    const result = await applyGiftCardLifecycle(now);
    // Revalidate even on a zero-transition retry: a previous invocation may
    // have committed its DB transaction and then failed during cache eviction.
    revalidateGiftCardLifecyclePaths(result.affectedStoreIds);
    await finishLifecycleRun(runId, result, new Date());

    if (result.errors.length) {
      await safeReport(
        result.errors.map((item) => `${item.offerId}/${item.step}: ${item.error}`).join("; "),
      );
    }
    return Response.json({
      ok: result.errors.length === 0,
      ran: true,
      runId,
      runKind: "activate-archive",
      status: result.errors.length ? "partial" : "ok",
      sydneyDate: result.sydneyDate,
      activated: result.activatedOfferIds.length,
      archived: result.archivedOfferIds.length,
      historySealed: result.historySealedOfferIds.length,
      errorCount: result.errors.length,
    });
  } catch (error) {
    if (runId) {
      try {
        await failLifecycleRun(
          runId,
          error instanceof Error ? error.message : String(error),
          new Date(),
        );
      } catch {
        // Migration 030's stale-run takeover is the final lock-release backstop.
      }
    }
    await safeReport(error);
    if (isGiftCardLifecycleSchemaUnavailable(error)) {
      return Response.json(
        { ok: false, ran: false, skipped: "schema-unavailable" },
        { status: 503 },
      );
    }
    return Response.json(
      { ok: false, ran: Boolean(runId), error: "gift-card lifecycle failed" },
      { status: 500 },
    );
  }
}
