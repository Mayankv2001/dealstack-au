import { timingSafeEqual } from "node:crypto";
import {
  cronSecret,
  ozbExpiryRecheckBatchSize,
  ozbExpiryRecheckDryRun,
  ozbExpiryRecheckEnabled,
  ozbExpiryRecheckMinIntervalHours,
  ozbMonitorUserAgent,
} from "@/lib/env";
import { isMonitoringApproved } from "@/lib/admin/repos/compliance";
import { classifySourcePost } from "@/lib/monitor/validateSourcePost";
import {
  runRecheckExpiry,
  type RunRecheckDeps,
} from "@/lib/monitor/runRecheckExpiry";
import {
  archiveRecheckItem,
  finishRecheckRun,
  listRecheckCandidates,
  startRecheckRun,
  stampRecheckItem,
} from "@/lib/admin/repos/recheckExpiry";
import { reportOperationalError } from "@/lib/observability/report-server-error";

/**
 * Separate, production-safe expiry-recheck cron — INDEPENDENT of the ingestion
 * cron (/api/cron/monitor-feeds). Same CRON_SECRET auth. Off by default
 * (OZB_EXPIRY_RECHECK_ENABLED). It re-probes PENDING OzBargain review items and
 * archives the ones whose source post is confidently gone; it never publishes,
 * imports, or hard-deletes. Its own one-running lock (migration 020) prevents
 * overlapping runs.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

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
      { status: 503 }
    );
  }
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // Master switch — off by default. No DB, no network when disabled.
  if (!ozbExpiryRecheckEnabled()) {
    return Response.json({ ok: true, ran: false, skipped: "disabled" });
  }

  // The recheck makes outbound HEAD requests to OzBargain, so it is gated by the
  // same compliance approval as the ingestion monitor. Failing closed on any
  // uncertainty keeps us from probing the source without an approved review.
  let complianceApproved = false;
  try {
    complianceApproved = await isMonitoringApproved();
  } catch (error) {
    await reportOperationalError("recheck-compliance-check", error);
    return Response.json(
      { ok: false, ran: false, error: "compliance check failed" },
      { status: 500 }
    );
  }
  if (!complianceApproved) {
    return Response.json({ ok: true, ran: false, skipped: "blocked-by-compliance" });
  }

  let userAgent: string;
  try {
    userAgent = ozbMonitorUserAgent();
  } catch (error) {
    await reportOperationalError("recheck-user-agent", error);
    return Response.json(
      { ok: false, ran: false, error: "monitor user agent is not configured" },
      { status: 500 }
    );
  }

  const minIntervalHours = ozbExpiryRecheckMinIntervalHours();
  const deps: RunRecheckDeps = {
    now: () => new Date(),
    startRun: startRecheckRun,
    finishRun: finishRecheckRun,
    listCandidates: (now, limit) =>
      listRecheckCandidates(now, limit, minIntervalHours),
    classify: (url) => classifySourcePost(url, userAgent),
    archive: archiveRecheckItem,
    stamp: stampRecheckItem,
  };

  try {
    const outcome = await runRecheckExpiry(
      {
        batchSize: ozbExpiryRecheckBatchSize(),
        dryRun: ozbExpiryRecheckDryRun(),
      },
      deps
    );

    if (!outcome.started) {
      return Response.json({ ok: true, ran: false, skipped: outcome.reason });
    }

    const metrics = outcome.metrics;
    if (metrics.status === "partial") {
      await reportOperationalError(
        "recheck-run-partial",
        metrics.errors.join("; ") || "partial"
      );
    }

    // Safe structured JSON — counts and status only. Per-item error strings are
    // internal (already prefixed with item ids, no secrets or response bodies)
    // but are not echoed to the caller.
    return Response.json({
      ok: true,
      ran: true,
      runId: metrics.runId,
      status: metrics.status,
      dryRun: metrics.dryRun,
      scanned: metrics.scanned,
      active: metrics.active,
      expired: metrics.expired,
      deleted: metrics.deleted,
      unknown: metrics.unknown,
      fetchFailed: metrics.fetchFailed,
      wouldArchive: metrics.wouldArchive,
      actuallyArchived: metrics.actuallyArchived,
      skipped: metrics.skipped,
      errorCount: metrics.errors.length,
    });
  } catch (error) {
    // Log the real error out-of-band; never echo a raw internal message.
    await reportOperationalError("recheck-run", error);
    return Response.json(
      { ok: false, ran: false, error: "recheck run failed" },
      { status: 500 }
    );
  }
}
