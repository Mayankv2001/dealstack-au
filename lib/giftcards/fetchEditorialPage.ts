import {
  isApprovedPointHacksWeeklyUrl,
  resolveApprovedFeedRedirect,
} from "@/lib/security/urlPolicy";

export type FetchEditorialPageOutcome =
  | {
      kind: "ok";
      body: string;
      etag: string | null;
      lastModified: string | null;
    }
  | { kind: "not-modified" }
  | { kind: "blocked" | "error"; reason: string };

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 2;

async function boundedHtml(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error(`response body exceeds ${MAX_BYTES} byte limit`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_BYTES)
    throw new Error(`response body exceeds ${MAX_BYTES} byte limit`);
  return new TextDecoder().decode(buffer);
}

function blockedBody(body: string): string | null {
  const head = body.slice(0, 4000).toLowerCase();
  if (
    head.includes("just a moment") ||
    head.includes("challenge-platform") ||
    head.includes("cf-browser-verification") ||
    head.includes("/cdn-cgi/") ||
    head.includes("captcha")
  ) {
    return "anti-bot or challenge response; no bypass attempted";
  }
  if (!/<(?:!doctype\s+html|html|main|article)\b/i.test(head))
    return "response is not an HTML article page";
  return null;
}

/**
 * One bounded, identifying, conditional request to the exact approved page.
 * No browser emulation, retries, cookies, script execution or anti-bot bypass.
 */
export async function fetchPointHacksWeeklyPage(input: {
  url: string;
  userAgent: string;
  etag?: string | null;
  lastModified?: string | null;
  timeoutMs?: number;
}): Promise<FetchEditorialPageOutcome> {
  if (!isApprovedPointHacksWeeklyUrl(input.url))
    return { kind: "blocked", reason: "weekly source URL is not approved" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  let url = input.url;
  let redirects = 0;
  const seen = new Set<string>();
  const headers: Record<string, string> = {
    "user-agent": input.userAgent,
    accept: "text/html,application/xhtml+xml;q=0.9",
  };
  if (input.etag) headers["if-none-match"] = input.etag;
  if (input.lastModified) headers["if-modified-since"] = input.lastModified;
  try {
    while (true) {
      if (seen.has(url))
        return { kind: "blocked", reason: "redirect loop detected" };
      seen.add(url);
      const response = await fetch(url, {
        method: "GET",
        redirect: "manual",
        headers,
        signal: controller.signal,
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects >= MAX_REDIRECTS)
          return { kind: "blocked", reason: "too many redirects" };
        const location = response.headers.get("location");
        const next = location
          ? resolveApprovedFeedRedirect(
              "pointhacks_weekly_gift_cards",
              url,
              location,
            )
          : null;
        if (!next || !isApprovedPointHacksWeeklyUrl(next))
          return { kind: "blocked", reason: "redirect target is not approved" };
        url = next;
        redirects += 1;
        continue;
      }
      if (response.status === 304) {
        await response.body?.cancel();
        return { kind: "not-modified" };
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { kind: "error", reason: `upstream returned ${response.status}` };
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (contentType && !contentType.includes("text/html")) {
        await response.body?.cancel();
        return { kind: "blocked", reason: "upstream did not return HTML" };
      }
      const body = await boundedHtml(response);
      const blocked = blockedBody(body);
      if (blocked) return { kind: "blocked", reason: blocked };
      return {
        kind: "ok",
        body,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    }
  } catch (error) {
    return {
      kind: "error",
      reason:
        error instanceof DOMException && error.name === "AbortError"
          ? "request timed out"
          : error instanceof Error
            ? error.message
            : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
