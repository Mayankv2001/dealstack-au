import { timingSafeEqual } from "node:crypto";
import {
  cronSecret,
  ozbMonitorEnabled,
  ozbMonitorMaxFeedsPerRun,
  ozbMonitorMinIntervalHours,
  ozbMonitorUserAgent,
  ozbOfferDetectEnabled,
} from "@/lib/env";
import { isMonitoringApproved } from "@/lib/admin/repos/compliance";
import { fetchFeed } from "@/lib/monitor/fetchFeed";
import { runMonitor } from "@/lib/monitor/runMonitor";
import { runDailyPipeline } from "@/lib/monitor/runDailyPipeline";
import {
  archiveExpiredDeals,
  finishPipelineRun,
  startPipelineRun,
  validatePublishedSignals,
} from "@/lib/admin/repos/dailyPipeline";
import {
  insertFeedFetchLog,
  listDueEnabledFeeds,
  recordFeedPollState,
  upsertFeedItems,
} from "@/lib/admin/repos/feedSources";
import { reportOperationalError } from "@/lib/observability/report-server-error";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

  const monitorEnabled = ozbMonitorEnabled();
  let complianceApproved = false;
  let complianceError: string | null = null;
  try {
    complianceApproved = await isMonitoringApproved();
  } catch (error) {
    complianceError = errMessage(error);
    await reportOperationalError("pipeline-compliance-check", error);
  }

  let userAgent: string | null = null;
  if (monitorEnabled && complianceApproved) {
    try {
      userAgent = ozbMonitorUserAgent();
    } catch (error) {
      await reportOperationalError("pipeline-user-agent", error);
    }
  }

  try {
    const outcome = await runDailyPipeline(
      {
        monitorEnabled,
        complianceApproved,
        userAgent,
        preflightErrors: complianceError
          ? [`compliance check: ${complianceError}`]
          : undefined,
      },
      {
        now: () => new Date(),
        startRun: startPipelineRun,
        finishRun: finishPipelineRun,
        archiveExpired: archiveExpiredDeals,
        validateLive: validatePublishedSignals,
        fetchLatest: () =>
          runMonitor(
            { dryRun: false },
            {
              config: {
                enabled: true,
                userAgent: userAgent!,
                maxFeedsPerRun: ozbMonitorMaxFeedsPerRun(),
                minIntervalHours: ozbMonitorMinIntervalHours(),
              },
              now: () => new Date(),
              fetchFeed,
              selectFeeds: listDueEnabledFeeds,
              persistence: {
                upsertFeedItems,
                recordPollState: recordFeedPollState,
                insertFetchLog: insertFeedFetchLog,
              },
            }
          ),
      }
    );

    // Another invocation currently holds the one-running lock (migration 016)
    // — nothing ran: no archive, no validation, no fetch, no run row written.
    if (!outcome.started) {
      return Response.json({ ok: true, ran: false, skipped: outcome.reason });
    }
    const summary = outcome.summary;

    const body: Record<string, unknown> = {
      ok: summary.status === "ok" || summary.status === "disabled",
      ran: true,
      ...summary,
      ...(complianceError ? { complianceError } : {}),
    };

    if (
      monitorEnabled &&
      complianceApproved &&
      userAgent &&
      ozbOfferDetectEnabled()
    ) {
      try {
        const { runDetection } = await import("@/lib/monitor/runDetection");
        const { createDetectionPersistence } = await import(
          "@/lib/admin/repos/offerChanges"
        );
        const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        body.detection = await runDetection(createDetectionPersistence(), {
          sinceIso,
          dryRun: false,
        });
      } catch (error) {
        await reportOperationalError("offer-change-detection", error);
        body.detection = { error: errMessage(error) };
      }
    }
    return Response.json(body, {
      status: summary.status === "error" ? 500 : 200,
    });
  } catch (error) {
    await reportOperationalError("daily-pipeline-run", error);
    return Response.json(
      { ok: false, ran: false, error: errMessage(error) },
      { status: 500 }
    );
  }
}
