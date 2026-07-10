import type { Instrumentation } from "next";
import { reportServerError } from "@/lib/observability/report-server-error";

/**
 * Server-side error visibility (see lib/observability/report-server-error.ts).
 *
 * Next.js calls onRequestError for every error it captures on the server —
 * Server Component renders, Route Handlers, Server Actions and proxy — which
 * is exactly the class of failure the public site's graceful fallbacks
 * (`getStores()` returning static data, etc.) otherwise hide. Reports go to
 * the function logs always, and to the ops webhook when ALERT_WEBHOOK_URL is
 * configured.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const error = err as { digest?: string } & Error;
  await reportServerError({
    digest: error.digest ?? "none",
    name: error.name ?? "Error",
    message: error.message ?? String(err),
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
