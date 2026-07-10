import { parseRetryAfter } from "./backoff";
import {
  isApprovedFeedUrl,
  resolveApprovedFeedRedirect,
  safeHttpsUrl,
} from "@/lib/security/urlPolicy";

/**
 * The ONE networked module of the feed monitor — a single conditional GET of one
 * permitted RSS/Atom feed URL.
 *
 * Strictly feed-only and compliance-shaped:
 *   - sends an identifying User-Agent (no spoofed browser string) + an XML Accept;
 *   - conditional GET via ETag / Last-Modified so unchanged feeds cost nothing;
 *   - a hard per-request timeout;
 *   - NEVER follows item links, NEVER opens HTML pages, NEVER attempts to solve a
 *     Cloudflare / login / CAPTCHA challenge — a challenge or HTML/non-XML body is
 *     reported as `blocked` so the caller stops and disables the feed.
 *
 * It returns a structured outcome and writes nothing. It must only be reached
 * from the monitor entry points (the manual script today), never from a
 * request-handling page or public route.
 */

export type FetchFeedOutcome =
  | {
      kind: "ok";
      httpStatus: number;
      body: string;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      kind: "not-modified";
      httpStatus: number;
      etag: string | null;
      lastModified: string | null;
    }
  | {
      kind: "blocked";
      httpStatus: number | null;
      reason: string;
      retryAfterSeconds: number | null;
    }
  | {
      kind: "error";
      httpStatus: number | null;
      reason: string;
      retryAfterSeconds: number | null;
    };

export interface FetchFeedInput {
  feedUrl: string;
  sourceType: string;
  etag?: string | null;
  lastModified?: string | null;
  /** Identifying UA with a contact URL — required (never a spoofed browser UA). */
  userAgent: string;
  timeoutMs?: number;
  /** Injectable clock for deterministic Retry-After date math (tests). */
  now?: Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ACCEPT_XML =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8";
/** Sniff a generous prefix — challenge pages put their markers near the top. */
const SNIFF_LEN = 2000;

/** How a response body reads. Exported pure helper so tests don't need network. */
export type BodyClass = "feed" | "html" | "cloudflare" | "non-xml";

export function classifyBody(body: string): BodyClass {
  const head = body.slice(0, SNIFF_LEN).toLowerCase();
  // Anti-bot / Cloudflare challenge markers — treat as blocked, never bypass.
  if (
    head.includes("just a moment") ||
    head.includes("cf-browser-verification") ||
    head.includes("challenge-platform") ||
    head.includes("attention required") ||
    head.includes("/cdn-cgi/")
  ) {
    return "cloudflare";
  }
  // trimStart() also drops a leading BOM (U+FEFF is ECMAScript whitespace).
  const trimmed = head.trimStart();
  if (trimmed.startsWith("<!doctype html") || trimmed.startsWith("<html")) {
    return "html";
  }
  if (
    trimmed.startsWith("<?xml") ||
    trimmed.startsWith("<rss") ||
    trimmed.startsWith("<feed") ||
    trimmed.includes("<rss") ||
    trimmed.includes("<feed")
  ) {
    return "feed";
  }
  return "non-xml";
}

function blockedReason(cls: BodyClass, contentType: string): string {
  switch (cls) {
    case "cloudflare":
      return "anti-bot / Cloudflare challenge body — not a feed (not bypassing)";
    case "html":
      return "HTML page body — not an RSS/Atom feed";
    default:
      return `non-XML body (content-type: ${contentType || "unknown"})`;
  }
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

async function readBoundedBody(
  response: Response,
  maxBytes: number,
  truncate: boolean
): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (
    !truncate &&
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    await response.body?.cancel();
    throw new Error(`response body exceeds ${maxBytes} byte limit`);
  }

  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const nextBytes = bytes + value.byteLength;
    if (nextBytes > maxBytes) {
      if (truncate) {
        const remaining = Math.max(0, maxBytes - bytes);
        body += decoder.decode(value.subarray(0, remaining));
        await reader.cancel();
        return body;
      }
      await reader.cancel();
      throw new Error(`response body exceeds ${maxBytes} byte limit`);
    }
    bytes = nextBytes;
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

/** Conditional GET of one feed URL. Networked; returns a structured outcome. */
export async function fetchFeed(input: FetchFeedInput): Promise<FetchFeedOutcome> {
  const now = input.now ?? new Date();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const initialUrl = safeHttpsUrl(input.feedUrl);
  if (!initialUrl || !isApprovedFeedUrl(input.sourceType, initialUrl)) {
    return {
      kind: "blocked",
      httpStatus: null,
      reason: "feed URL is not approved for its source type",
      retryAfterSeconds: null,
    };
  }

  const headers: Record<string, string> = {
    "user-agent": input.userAgent,
    accept: ACCEPT_XML,
  };
  if (input.etag) headers["if-none-match"] = input.etag;
  if (input.lastModified) headers["if-modified-since"] = input.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const seen = new Set<string>();
  let currentUrl = initialUrl;
  let redirects = 0;

  try {
    while (true) {
      if (seen.has(currentUrl)) {
        return {
          kind: "blocked",
          httpStatus: null,
          reason: "feed redirect loop detected",
          retryAfterSeconds: null,
        };
      }
      seen.add(currentUrl);

      const response = await fetch(currentUrl, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
      });

      if (REDIRECT_STATUSES.has(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location) {
          return {
            kind: "blocked",
            httpStatus: response.status,
            reason: "feed redirect is missing a Location header",
            retryAfterSeconds: null,
          };
        }
        if (redirects >= MAX_REDIRECTS) {
          return {
            kind: "blocked",
            httpStatus: response.status,
            reason: `feed exceeded ${MAX_REDIRECTS} approved redirects`,
            retryAfterSeconds: null,
          };
        }
        const nextUrl = resolveApprovedFeedRedirect(
          input.sourceType,
          currentUrl,
          location
        );
        if (!nextUrl) {
          return {
            kind: "blocked",
            httpStatus: response.status,
            reason: "feed redirect target is not approved",
            retryAfterSeconds: null,
          };
        }
        currentUrl = nextUrl;
        redirects += 1;
        continue;
      }

      const retryAfterSeconds = parseRetryAfter(
        response.headers.get("retry-after"),
        now
      );
      const etag = response.headers.get("etag");
      const lastModified = response.headers.get("last-modified");
      const contentType = (
        response.headers.get("content-type") ?? ""
      ).toLowerCase();

      if (response.status === 304) {
        await response.body?.cancel();
        return { kind: "not-modified", httpStatus: 304, etag, lastModified };
      }

      if (!response.ok) {
        let hint = "";
        try {
          hint = await readBoundedBody(response, SNIFF_LEN, true);
        } catch {
          // Body unavailable; classify from the HTTP status only.
        }
        const hintClass = classifyBody(hint);
        const challenge =
          hintClass === "cloudflare" ||
          ((response.status === 403 || response.status === 503) &&
            (hintClass === "html" || hintClass === "non-xml"));
        if (challenge) {
          return {
            kind: "blocked",
            httpStatus: response.status,
            reason: `${blockedReason(hintClass, contentType)} (HTTP ${response.status})`,
            retryAfterSeconds,
          };
        }
        return {
          kind: "error",
          httpStatus: response.status,
          reason: `HTTP ${response.status} ${response.statusText}`.trim(),
          retryAfterSeconds,
        };
      }

      let body: string;
      try {
        body = await readBoundedBody(response, MAX_BODY_BYTES, false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        return {
          kind: "error",
          httpStatus: response.status,
          reason: `failed to read body: ${
            err instanceof Error ? err.message : String(err)
          }`,
          retryAfterSeconds,
        };
      }

      const cls = classifyBody(body);
      if (cls !== "feed") {
        return {
          kind: "blocked",
          httpStatus: response.status,
          reason: blockedReason(cls, contentType),
          retryAfterSeconds,
        };
      }

      return {
        kind: "ok",
        httpStatus: response.status,
        body,
        etag,
        lastModified,
      };
    }
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      kind: "error",
      httpStatus: null,
      reason: aborted
        ? `request timed out after ${timeoutMs}ms`
        : `network error: ${err instanceof Error ? err.message : String(err)}`,
      retryAfterSeconds: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
