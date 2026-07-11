import { alertWebhookUrl } from "@/lib/env";
import { sanitizeDiagnostic, sanitizePath } from "@/lib/observability/sanitize";

/**
 * Server-side error reporting — SERVER ONLY.
 *
 * Two sinks, both best-effort and non-throwing:
 *   1. A single structured console.error line (always). Vercel function logs
 *      pick this up; grep for "[server-error]".
 *   2. An optional ops webhook (ALERT_WEBHOOK_URL, e.g. a Slack incoming
 *      webhook). Inert when the env var is unset, so local/dev/preview builds
 *      never make network calls.
 *
 * Deduping: serverless instances are short-lived, so a simple in-memory map
 * keyed by error digest suppresses repeat webhook pings for the same error
 * within a window. It resets per cold start — that is acceptable; the goal is
 * "don't page 400 times during an incident", not exactly-once delivery.
 */

const WEBHOOK_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const WEBHOOK_TIMEOUT_MS = 3000;
const MAX_TRACKED_DIGESTS = 200;

const lastSentByDigest = new Map<string, number>();

export interface ServerErrorReport {
  digest: string;
  name: string;
  message: string;
  path: string;
  method: string;
  routePath: string;
  routeType: string;
}

function shouldSendWebhook(digest: string, now: number): boolean {
  const last = lastSentByDigest.get(digest);
  if (last !== undefined && now - last < WEBHOOK_DEDUPE_WINDOW_MS) return false;
  // Bound the map so a pathological spread of digests cannot grow it forever.
  if (lastSentByDigest.size >= MAX_TRACKED_DIGESTS) lastSentByDigest.clear();
  lastSentByDigest.set(digest, now);
  return true;
}

/** Never throws. Await it (Next requires async work in onRequestError to be awaited). */
export async function reportServerError(
  report: ServerErrorReport
): Promise<void> {
  try {
    const safeReport = {
      ...report,
      name: sanitizeDiagnostic(report.name, 100),
      message: sanitizeDiagnostic(report.message, 500),
      path: sanitizePath(report.path),
      routePath: sanitizePath(report.routePath),
    };
    console.error(`[server-error] ${JSON.stringify(safeReport)}`);

    const webhook = alertWebhookUrl();
    if (!webhook) return;
    if (!shouldSendWebhook(report.digest, Date.now())) return;

    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // "text" is the lowest-common-denominator payload (Slack-compatible;
        // most webhook receivers accept or ignore it).
        text:
          `DealStack server error: ${safeReport.name}: ${safeReport.message}\n` +
          `route: ${safeReport.method} ${safeReport.routePath} (${safeReport.routeType})\n` +
          `path: ${safeReport.path}\ndigest: ${safeReport.digest}`,
      }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (err) {
    // Reporting must never cascade into a second failure.
    console.error("[server-error] reporter failed:", err);
  }
}

/** Reports caught operational failures that Next's onRequestError never sees. */
export async function reportOperationalError(
  area: string,
  error: unknown
): Promise<void> {
  await reportServerError({
    digest: `operational-${area}`,
    name: "OperationalError",
    message: `${area}: ${sanitizeDiagnostic(error, 350)}`,
    path: `/internal/${area}`,
    method: "INTERNAL",
    routePath: area,
    routeType: "operational",
  });
}
