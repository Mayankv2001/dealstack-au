import {
  isApprovedOzBargainPostUrl,
  safeHttpsUrl,
} from "@/lib/security/urlPolicy";

export type SourcePostStatus = "active" | "removed" | "unknown";

export interface SourcePostValidation {
  status: SourcePostStatus;
  reason: string | null;
}

/**
 * The richer 5-state classification used by the expiry-recheck job
 * (lib/monitor/runRecheckExpiry). `expired` is part of the contract but is
 * NEVER produced by the HEAD probe below — a status-only check cannot tell an
 * "expired-but-still-present" OzBargain post from a live one without scraping
 * the page body, which is prohibited. `expired` is instead produced OFFLINE
 * from structured facts the approved feed itself carries (see
 * classifyStoredSourceState in lib/monitor/recheckExpiry.ts).
 */
export type SourceStatus =
  | "active"
  | "expired"
  | "deleted"
  | "unknown"
  | "fetch_failed";

export interface SourceClassification {
  status: SourceStatus;
  httpStatus: number | null;
  reason: string | null;
}

const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 2;

/**
 * Internal normalised probe outcome. ONE HEAD-only fetch implementation feeds
 * both public shapes below, so there is a single networked code path and a
 * single URL-safety boundary (no duplicated fetching or URL validation).
 */
type Probe =
  | { signal: "active" }
  | { signal: "deleted"; httpStatus: number } // permanent 404 / 410
  | { signal: "gone" } // redirect left the approved post boundary
  | { signal: "unsafe" } // source URL is not a safe HTTPS URL
  | { signal: "unsupported" } // safe, but not an approved OzBargain post URL
  | { signal: "http"; httpStatus: number | null; reason: string } // non-2xx / odd 3xx
  | { signal: "network"; reason: string }; // fetch threw: timeout / DNS / reset

/** Status-only validation: HEAD requests, no page body download or parsing. */
async function probeSourcePost(
  sourceUrl: string,
  userAgent: string,
  fetchImpl: typeof fetch
): Promise<Probe> {
  if (!safeHttpsUrl(sourceUrl)) return { signal: "unsafe" };
  if (!isApprovedOzBargainPostUrl(sourceUrl)) return { signal: "unsupported" };

  let current = safeHttpsUrl(sourceUrl)!;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        method: "HEAD",
        redirect: "manual",
        cache: "no-store",
        headers: { "User-Agent": userAgent, Accept: "text/html" },
        signal: controller.signal,
      });
    } catch (error) {
      return {
        signal: "network",
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 200 && response.status < 300) {
      return { signal: "active" };
    }
    if (response.status === 404 || response.status === 410) {
      return { signal: "deleted", httpStatus: response.status };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return {
          signal: "http",
          httpStatus: response.status,
          reason: "redirect-without-location",
        };
      }
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        return {
          signal: "http",
          httpStatus: response.status,
          reason: "invalid-redirect",
        };
      }
      if (!isApprovedOzBargainPostUrl(next)) return { signal: "gone" };
      current = next;
      continue;
    }
    return {
      signal: "http",
      httpStatus: response.status,
      reason: `source-http-${response.status}`,
    };
  }
  return { signal: "http", httpStatus: null, reason: "too-many-redirects" };
}

/**
 * Status-only validation returning the coarse {active, removed, unknown} shape
 * used by the published-signal validator. HEAD requests only; never downloads or
 * parses a page body. Behaviour is unchanged from the original implementation.
 */
export async function validateSourcePost(
  sourceUrl: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch
): Promise<SourcePostValidation> {
  const probe = await probeSourcePost(sourceUrl, userAgent, fetchImpl);
  switch (probe.signal) {
    case "active":
      return { status: "active", reason: null };
    case "deleted":
      return { status: "removed", reason: `source-http-${probe.httpStatus}` };
    case "gone":
      return { status: "removed", reason: "redirect-left-approved-post-boundary" };
    case "unsafe":
      return { status: "removed", reason: "unsafe-or-unapproved-source-url" };
    case "unsupported":
      return { status: "unknown", reason: "source-status-check-not-supported" };
    case "http":
      return { status: "unknown", reason: probe.reason };
    case "network":
      return { status: "unknown", reason: probe.reason };
  }
}

/**
 * Classify one OzBargain source post into the 5-state enum for expiry recheck.
 *
 * Reliable-signal priority (spec): a confirmed permanent HTTP 404/410 is the
 * ONLY signal treated as `deleted`. Everything transient or ambiguous — timeout,
 * DNS/network failure, 429, 5xx, an off-boundary redirect, an unexpected 4xx —
 * is `fetch_failed` or `unknown`, both of which KEEP the item in review. A
 * 429/5xx/network failure is deliberately `fetch_failed`, never `deleted`.
 */
export async function classifySourcePost(
  sourceUrl: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch
): Promise<SourceClassification> {
  const probe = await probeSourcePost(sourceUrl, userAgent, fetchImpl);
  switch (probe.signal) {
    case "active":
      return { status: "active", httpStatus: 200, reason: null };
    case "deleted":
      return {
        status: "deleted",
        httpStatus: probe.httpStatus,
        reason: `source-http-${probe.httpStatus}`,
      };
    case "gone":
      // A redirect off the approved /node/N boundary is suggestive but not a
      // confirmed deletion (could be a merge). Keep it non-archiving.
      return {
        status: "unknown",
        httpStatus: null,
        reason: "redirect-left-approved-post-boundary",
      };
    case "unsafe":
      return { status: "unknown", httpStatus: null, reason: "unsafe-source-url" };
    case "unsupported":
      return {
        status: "unknown",
        httpStatus: null,
        reason: "source-status-check-not-supported",
      };
    case "http": {
      // 429 (rate limited) and 5xx (server) are transient — never expired.
      const transient =
        probe.httpStatus === 429 ||
        (probe.httpStatus !== null && probe.httpStatus >= 500);
      return {
        status: transient ? "fetch_failed" : "unknown",
        httpStatus: probe.httpStatus,
        reason: probe.reason,
      };
    }
    case "network":
      // Timeout / DNS / connection reset — the fetch never produced an answer.
      return { status: "fetch_failed", httpStatus: null, reason: probe.reason };
  }
}
