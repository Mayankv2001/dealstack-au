import { parseRetryAfter } from "./backoff";

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
  etag?: string | null;
  lastModified?: string | null;
  /** Identifying UA with a contact URL — required (never a spoofed browser UA). */
  userAgent: string;
  timeoutMs?: number;
  /** Injectable clock for deterministic Retry-After date math (tests). */
  now?: Date;
}

const DEFAULT_TIMEOUT_MS = 10_000;
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

/** Conditional GET of one feed URL. Networked; returns a structured outcome. */
export async function fetchFeed(input: FetchFeedInput): Promise<FetchFeedOutcome> {
  const now = input.now ?? new Date();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = {
    "user-agent": input.userAgent,
    accept: ACCEPT_XML,
  };
  if (input.etag) headers["if-none-match"] = input.etag;
  if (input.lastModified) headers["if-modified-since"] = input.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(input.feedUrl, {
      method: "GET",
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
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

  const retryAfterSeconds = parseRetryAfter(
    response.headers.get("retry-after"),
    now
  );
  const etag = response.headers.get("etag");
  const lastModified = response.headers.get("last-modified");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();

  if (response.status === 304) {
    return { kind: "not-modified", httpStatus: 304, etag, lastModified };
  }

  if (!response.ok) {
    // Anti-bot systems often answer 403/503 with a challenge page → blocked.
    let hint = "";
    try {
      hint = (await response.text()).slice(0, SNIFF_LEN);
    } catch {
      // body unavailable — fall through and treat as a plain HTTP error
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
    body = await response.text();
  } catch (err) {
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

  return { kind: "ok", httpStatus: response.status, body, etag, lastModified };
}
