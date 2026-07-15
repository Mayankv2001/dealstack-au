import { timingSafeEqual } from "node:crypto";
import {
  cronSecret,
  gcdbIngestEnabled,
  gcdbMaxItemsPerRun,
  gcdbRssUrl,
  gcdbUserAgent,
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
import { decideSchedule } from "@/lib/giftcards/schedule";
import { decideAutomatedRetrieval } from "@/lib/giftcards/sourceRetrievalPermission";
import {
  EXTRACTOR_VERSION,
  runGiftCardIngest,
  type RunIngestDeps,
} from "@/lib/giftcards/runIngest";
import { runGuardedIngest } from "@/lib/giftcards/runGuarded";
import { fetchFeed } from "@/lib/monitor/fetchFeed";
import { reportOperationalError } from "@/lib/observability/report-server-error";
import { isGiftCardJobRunSchemaUnavailable } from "@/lib/admin/repos/giftCardJobRunErrors";

/**
 * Gift-card ingest cron — SEPARATE from the OzBargain monitor and driven by
 * an external UTC scheduler at BOTH possible UTC equivalents of 7:00 AM
 * Australia/Sydney (20:00 UTC during AEDT, 21:00 UTC during AEST). The route
 * itself decides, DST-safely, whether to run:
 *   auth → env flag → DB source gates → Sydney 7am hour → 40h interval guard
 *   → one-running DB lock → bounded, allowlisted conditional GET → stage.
 * Everything staged awaits admin review; nothing here publishes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const SOURCE_ID = "gcdb";

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
  if (!gcdbIngestEnabled()) {
    return Response.json({
      ok: true,
      ran: false,
      skipped: "environment-disabled",
    });
  }

  const now = new Date();
  try {
    // DB-level gates: source enablement, explicit fetch permission and both
    // recorded permission reviews must all pass. `force` never bypasses these.
    const source = await getGiftCardSource(SOURCE_ID);
    const permission = decideAutomatedRetrieval(true, {
      sourceExists: source != null,
      enabled: source?.enabled ?? false,
      automatedFetchAllowed: source?.automated_fetch_allowed ?? false,
      termsCheckedAt: source?.terms_checked_at ?? null,
      robotsCheckedAt: source?.robots_checked_at ?? null,
    });
    if (!permission.allowed) {
      return Response.json({
        ok: true,
        ran: false,
        skipped: permission.reason,
        source: SOURCE_ID,
      });
    }
    if (!source) {
      return Response.json({
        ok: true,
        ran: false,
        skipped: "source-missing",
        source: SOURCE_ID,
      });
    }

    const feedUrl = gcdbRssUrl() ?? source.feed_url;
    if (!feedUrl) {
      return Response.json({ ok: true, ran: false, skipped: "no-feed-url" });
    }
    const userAgent = gcdbUserAgent(); // throws when missing — fail closed

    // Sydney-7am + every-other-day guards (?force=1 is for manual admin runs).
    const force = new URL(request.url).searchParams.get("force") === "1";
    const lastStart = await lastIngestRunStart(SOURCE_ID);
    const decision = decideSchedule(now, lastStart, { force });
    if (!decision.run) {
      return Response.json({
        ok: true,
        ran: false,
        skipped: decision.reason,
        source: SOURCE_ID,
        lastRunStartedAt: lastStart?.toISOString() ?? null,
      });
    }

    const deps: RunIngestDeps = {
      now: () => new Date(),
      fetchFeed: async (config) => {
        const outcome = await fetchFeed({
          feedUrl: config.feedUrl,
          sourceType: SOURCE_ID, // fixed host allowlist in lib/security/urlPolicy
          etag: config.etag,
          lastModified: config.lastModified,
          userAgent,
        });
        if (outcome.kind === "ok") {
          return {
            kind: "ok",
            body: outcome.body,
            etag: outcome.etag,
            lastModified: outcome.lastModified,
          };
        }
        if (outcome.kind === "not-modified") return { kind: "not-modified" };
        return { kind: outcome.kind, reason: outcome.reason };
      },
      loadRawItems,
      persistRejectedRawItem,
      insertRawItem,
      updateRawItem,
      touchRawItem,
      stageCandidate,
      recordSourceState,
    };

    // Source/kind DB lock + GUARANTEED finalisation: once the slot is claimed,
    // any later failure finalises the run as `error` (releasing the lock) and
    // observability is best-effort — see lib/giftcards/runGuarded.ts.
    let runId: string | null = null;
    const started = Date.now();
    const outcome = await runGuardedIngest({
      acquire: async () => {
        const start = await startIngestRun(SOURCE_ID, now);
        if (start.started) runId = start.runId;
        return start;
      },
      run: () =>
        runGiftCardIngest(
          {
            id: SOURCE_ID,
            feedUrl,
            etag: source.etag,
            lastModified: source.last_modified,
          },
          { maxItems: gcdbMaxItemsPerRun() },
          deps
        ),
      finish: (id, metrics) =>
        finishIngestRun(id, metrics, EXTRACTOR_VERSION, new Date()),
      fail: (id, message) => failIngestRun(id, message, new Date()),
      report: (message) => reportOperationalError("gift-card-ingest", message),
    });

    if (outcome.ran === false) {
      return Response.json({ ok: true, ran: false, skipped: outcome.skipped });
    }
    if ("failed" in outcome) {
      // Run was finalised as error inside the guard; never leak the message.
      return Response.json(
        { ok: false, ran: true, source: SOURCE_ID, error: "gift-card ingest failed" },
        { status: 500 }
      );
    }

    const { metrics } = outcome;
    return Response.json({
      ok: metrics.status !== "error",
      ran: true,
      runId,
      source: SOURCE_ID,
      status: metrics.status,
      fetchStatus: metrics.fetchStatus,
      itemsSeen: metrics.itemsSeen,
      itemsNew: metrics.itemsNew,
      itemsUpdated: metrics.itemsUpdated,
      itemsUnchanged: metrics.itemsUnchanged,
      itemsRejected: metrics.itemsRejected,
      newCandidates: metrics.candidatesNew,
      changedCandidates: metrics.candidatesChanged,
      errorCount: metrics.errors.length,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    // Pre-lock failures only (auth/env/source gates, UA) — no run to finalise.
    if (isGiftCardJobRunSchemaUnavailable(error)) {
      return Response.json(
        { ok: false, ran: false, skipped: "schema-unavailable" },
        { status: 503 },
      );
    }
    await reportOperationalError("gift-card-ingest", error);
    return Response.json(
      { ok: false, ran: false, error: "gift-card ingest failed" },
      { status: 500 }
    );
  }
}
