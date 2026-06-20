import { timingSafeEqual } from "node:crypto";
import {
  cronSecret,
  ozbMonitorEnabled,
  ozbMonitorMaxFeedsPerRun,
  ozbMonitorMinIntervalHours,
  ozbMonitorUserAgent,
} from "@/lib/env";
import { isMonitoringApproved } from "@/lib/admin/repos/compliance";
import { fetchFeed } from "@/lib/monitor/fetchFeed";
import { runMonitor } from "@/lib/monitor/runMonitor";
import {
  insertFeedFetchLog,
  listDueEnabledFeeds,
  recordFeedPollState,
  upsertFeedItems,
} from "@/lib/admin/repos/feedSources";

/**
 * Secret-gated OzBargain monitor cron route — Phase 1 cron.
 *
 * GET /api/cron/monitor-feeds. Vercel Cron hits this every 12h (see vercel.json)
 * and, when CRON_SECRET is set in the project env, sends
 * `Authorization: Bearer ${CRON_SECRET}` automatically.
 *
 * Gate order — NOTHING fetches until every gate passes:
 *   1. CRON_SECRET not configured     → 503 (refuse to run; never open).
 *   2. Authorization mismatch         → 401.
 *   3. OZB_MONITOR_ENABLED not 'true' → 200 { disabled: true } (master kill switch).
 *   4. Compliance not approved        → 200 { blockedByCompliance: true }.
 *   5. All gates pass                 → runMonitor() in WRITE mode, writing ONLY
 *      the staging tables (feed_items, feed_fetch_log, feed_sources poll-state).
 *      It NEVER writes ozbargain_signals and nothing is auto-published — admin
 *      review via /admin/signals/queue stays mandatory. Feed errors are caught
 *      and returned as JSON, never thrown.
 *
 * This is the only request path allowed to fetch, and it is BOTH secret-gated and
 * flag-gated; no page imports the fetcher, so user traffic can never trigger it.
 * The monitor itself does no scraping, follows no links, and never bypasses
 * Cloudflare/login/rate-limits/robots — a challenge/HTML response is "blocked".
 */

export const dynamic = "force-dynamic";
// node:crypto + the service-role Supabase client require the Node runtime (never edge).
export const runtime = "nodejs";

/** Constant-time Bearer comparison. Length may leak; the secret value does not. */
function isAuthorized(header: string | null, secret: string): boolean {
  const prefix = "Bearer ";
  if (!header || !header.startsWith(prefix)) return false;
  const provided = Buffer.from(header.slice(prefix.length));
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function GET(request: Request): Promise<Response> {
  // 1 ── The secret must be configured, or we refuse to run (never run open).
  const secret = cronSecret();
  if (!secret) {
    return Response.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  // 2 ── Authenticate the caller (Vercel Cron sends the bearer automatically).
  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  // 3 ── Master kill switch — not 'true' means zero outbound requests.
  if (!ozbMonitorEnabled()) {
    return Response.json({
      ok: true,
      ran: false,
      disabled: true,
      note: "OZB_MONITOR_ENABLED is not 'true' — kill switch off, no fetch performed.",
    });
  }

  // 4 ── Compliance gate (a DB read only; no external fetch). Approval mandatory.
  let complianceApproved: boolean;
  try {
    complianceApproved = await isMonitoringApproved();
  } catch (err) {
    return Response.json(
      { ok: false, ran: false, error: `Compliance check failed: ${errMessage(err)}` },
      { status: 500 }
    );
  }
  if (!complianceApproved) {
    return Response.json({
      ok: true,
      ran: false,
      blockedByCompliance: true,
      note: "No approved compliance review on file — refusing to fetch.",
    });
  }

  // 5 ── All gates passed — run the monitor in WRITE mode, staging tables only.
  try {
    const userAgent = ozbMonitorUserAgent(); // required when enabled; throws if unset
    const summary = await runMonitor(
      { dryRun: false },
      {
        config: {
          enabled: true,
          userAgent,
          maxFeedsPerRun: ozbMonitorMaxFeedsPerRun(), // default 1 (first version)
          minIntervalHours: ozbMonitorMinIntervalHours(),
        },
        now: () => new Date(),
        fetchFeed,
        selectFeeds: listDueEnabledFeeds,
        // Writes ONLY feed_items + feed_fetch_log + feed_sources poll-state.
        persistence: {
          upsertFeedItems,
          recordPollState: recordFeedPollState,
          insertFetchLog: insertFeedFetchLog,
        },
      }
    );

    return Response.json({
      ok: true,
      ran: true,
      enabled: summary.enabled,
      feedsConsidered: summary.feedsConsidered,
      feedsProcessed: summary.feedsProcessed,
      // Per-feed status only — raw titles/bodies are never echoed back.
      results: summary.results.map((r) => ({
        feedId: r.feedId,
        label: r.label,
        status: r.status,
        httpStatus: r.httpStatus,
        itemsSeen: r.itemsSeen,
        itemsNew: r.itemsNew,
        error: r.error,
      })),
    });
  } catch (err) {
    // A failure must not 500 the page or leak secrets — return a JSON summary.
    return Response.json(
      { ok: false, ran: false, error: errMessage(err) },
      { status: 500 }
    );
  }
}
