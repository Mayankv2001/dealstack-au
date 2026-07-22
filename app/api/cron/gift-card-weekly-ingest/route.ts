import { timingSafeEqual } from "node:crypto";
import {
  cronSecret,
  pointHacksWeeklyIngestEnabled,
  pointHacksWeeklyMaxItems,
  pointHacksWeeklyUserAgent,
} from "@/lib/env";
import {
  failIngestRun,
  finishIngestRun,
  getGiftCardSource,
  insertRawItem,
  lastIngestRunStart,
  loadRawItems,
  persistRejectedRawItem,
  recordSourceState,
  stageCandidate,
  startIngestRun,
  touchRawItem,
  updateRawItem,
} from "@/lib/admin/repos/giftCardPipeline";
import { fetchPointHacksWeeklyPage } from "@/lib/giftcards/fetchEditorialPage";
import {
  extractPointHacksWeeklyOffer,
  parsePointHacksWeeklyPage,
  POINT_HACKS_WEEKLY_PARSER_VERSION,
  POINT_HACKS_WEEKLY_SOURCE_ID,
  weeklyFactsToSourceItem,
} from "@/lib/giftcards/pointHacksWeekly";
import { decideAutomatedRetrieval } from "@/lib/giftcards/sourceRetrievalPermission";
import { runGuardedIngest } from "@/lib/giftcards/runGuarded";
import {
  runGiftCardIngest,
  type RunIngestDeps,
} from "@/lib/giftcards/runIngest";
import { decideWeeklySchedule } from "@/lib/giftcards/schedule";
import { reportOperationalError } from "@/lib/observability/report-server-error";
import { isGiftCardJobRunSchemaUnavailable } from "@/lib/admin/repos/giftCardJobRunErrors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}

export async function GET(request: Request): Promise<Response> {
  const secret = cronSecret();
  if (!secret)
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  if (!authorized(request.headers.get("authorization"), secret))
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const environmentEnabled = pointHacksWeeklyIngestEnabled();
  if (!environmentEnabled)
    return Response.json({ ok: true, ran: false, skipped: "environment-disabled" });

  const now = new Date();
  try {
    const source = await getGiftCardSource(POINT_HACKS_WEEKLY_SOURCE_ID);
    const permission = decideAutomatedRetrieval(environmentEnabled, {
      sourceExists: source != null,
      enabled: source?.enabled ?? false,
      automatedFetchAllowed: source?.automated_fetch_allowed ?? false,
      termsCheckedAt: source?.terms_checked_at ?? null,
      robotsCheckedAt: source?.robots_checked_at ?? null,
    });
    if (!permission.allowed)
      return Response.json({
        ok: true,
        ran: false,
        skipped: permission.reason,
        source: POINT_HACKS_WEEKLY_SOURCE_ID,
      });
    if (!source)
      return Response.json({ ok: true, ran: false, skipped: "source-missing" });

    const force = new URL(request.url).searchParams.get("force") === "1";
    const lastStart = await lastIngestRunStart(POINT_HACKS_WEEKLY_SOURCE_ID);
    const schedule = decideWeeklySchedule(now, lastStart, { force });
    if (!schedule.run)
      return Response.json({ ok: true, ran: false, skipped: schedule.reason });
    const userAgent = pointHacksWeeklyUserAgent();

    const deps: RunIngestDeps = {
      now: () => new Date(),
      parserVersion: POINT_HACKS_WEEKLY_PARSER_VERSION,
      parseBody: (body) =>
        parsePointHacksWeeklyPage(body, source.feed_url).map(
          weeklyFactsToSourceItem,
        ),
      extractItem: extractPointHacksWeeklyOffer,
      fetchFeed: async (config) =>
        fetchPointHacksWeeklyPage({
          url: config.feedUrl,
          userAgent,
          etag: config.etag,
          lastModified: config.lastModified,
        }),
      loadRawItems,
      persistRejectedRawItem,
      insertRawItem,
      updateRawItem,
      touchRawItem,
      stageCandidate,
      recordSourceState,
    };
    let runId: string | null = null;
    const outcome = await runGuardedIngest({
      acquire: async () => {
        const result = await startIngestRun(
          POINT_HACKS_WEEKLY_SOURCE_ID,
          now,
        );
        if (result.started) runId = result.runId;
        return result;
      },
      run: () =>
        runGiftCardIngest(
          {
            id: POINT_HACKS_WEEKLY_SOURCE_ID,
            feedUrl: source.feed_url,
            etag: source.etag,
            lastModified: source.last_modified,
          },
          { maxItems: pointHacksWeeklyMaxItems() },
          deps,
        ),
      finish: (id, metrics) =>
        finishIngestRun(
          id,
          metrics,
          POINT_HACKS_WEEKLY_PARSER_VERSION,
          new Date(),
        ),
      fail: (id, message) => failIngestRun(id, message, new Date()),
      report: (message) =>
        reportOperationalError("gift-card-weekly-ingest", message),
    });
    if (!outcome.ran)
      return Response.json({ ok: true, ran: false, skipped: outcome.skipped });
    if ("failed" in outcome)
      return Response.json(
        { ok: false, ran: true, error: "weekly gift-card ingest failed" },
        { status: 500 },
      );
    return Response.json({
      ok: outcome.metrics.status !== "error",
      ran: true,
      runId,
      source: POINT_HACKS_WEEKLY_SOURCE_ID,
      status: outcome.metrics.status,
      itemsSeen: outcome.metrics.itemsSeen,
      newCandidates: outcome.metrics.candidatesNew,
      changedCandidates: outcome.metrics.candidatesChanged,
      errorCount: outcome.metrics.errors.length,
      autoPublished: 0,
    });
  } catch (error) {
    if (isGiftCardJobRunSchemaUnavailable(error)) {
      return Response.json(
        { ok: false, ran: false, skipped: "schema-unavailable" },
        { status: 503 },
      );
    }
    await reportOperationalError("gift-card-weekly-ingest", error);
    return Response.json(
      { ok: false, ran: false, error: "weekly gift-card ingest failed" },
      { status: 500 },
    );
  }
}
