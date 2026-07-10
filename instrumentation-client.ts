import { inject } from "@vercel/analytics";

/**
 * Client-side observability. Runs once per page load, before hydration
 * (Next.js instrumentation-client convention — no layout changes needed).
 *
 * 1. Vercel Web Analytics: privacy-light, cookie-less, served same-origin
 *    (/_vercel/insights/*) so it stays inside the report-only CSP. Production
 *    only — the script does not exist on localhost. Requires Web Analytics to
 *    be enabled once in the Vercel dashboard; until then the beacon 404s
 *    harmlessly.
 * 2. Client error capture: uncaught errors and unhandled rejections beacon a
 *    compact payload to /api/client-error, which writes them into the Vercel
 *    function logs. Capped and deduped per page load so a render loop or a
 *    hostile page cannot spam the endpoint.
 */

if (process.env.NODE_ENV === "production") {
  inject();
}

const MAX_REPORTS_PER_LOAD = 5;
const seenMessages = new Set<string>();
let reportsSent = 0;

function reportClientError(type: string, message: string, stack?: string) {
  if (reportsSent >= MAX_REPORTS_PER_LOAD) return;
  const key = message.slice(0, 200);
  if (seenMessages.has(key)) return;
  seenMessages.add(key);
  reportsSent += 1;

  try {
    const body = JSON.stringify({
      type,
      message: message.slice(0, 500),
      stack: stack?.slice(0, 1500),
      url: window.location.pathname,
    });
    // sendBeacon survives page unloads; fall back to keepalive fetch.
    if (!navigator.sendBeacon?.("/api/client-error", body)) {
      void fetch("/api/client-error", {
        method: "POST",
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Never let error reporting throw its own errors.
  }
}

window.addEventListener("error", (event) => {
  reportClientError(
    "error",
    event.message || "Unknown error",
    event.error instanceof Error ? event.error.stack : undefined
  );
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  reportClientError(
    "unhandledrejection",
    reason instanceof Error ? reason.message : String(reason ?? "unknown"),
    reason instanceof Error ? reason.stack : undefined
  );
});
