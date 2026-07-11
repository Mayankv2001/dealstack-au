import {
  isApprovedOzBargainPostUrl,
  safeHttpsUrl,
} from "@/lib/security/urlPolicy";

export type SourcePostStatus = "active" | "removed" | "unknown";

export interface SourcePostValidation {
  status: SourcePostStatus;
  reason: string | null;
}

const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 2;

/** Status-only validation: HEAD requests, no page body download or parsing. */
export async function validateSourcePost(
  sourceUrl: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch
): Promise<SourcePostValidation> {
  if (!safeHttpsUrl(sourceUrl)) {
    return { status: "removed", reason: "unsafe-or-unapproved-source-url" };
  }
  if (!isApprovedOzBargainPostUrl(sourceUrl)) {
    return { status: "unknown", reason: "source-status-check-not-supported" };
  }

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
        status: "unknown",
        reason: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 200 && response.status < 300) {
      return { status: "active", reason: null };
    }
    if (response.status === 404 || response.status === 410) {
      return { status: "removed", reason: `source-http-${response.status}` };
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return { status: "unknown", reason: "redirect-without-location" };
      let next: string;
      try {
        next = new URL(location, current).href;
      } catch {
        return { status: "unknown", reason: "invalid-redirect" };
      }
      if (!isApprovedOzBargainPostUrl(next)) {
        return { status: "removed", reason: "redirect-left-approved-post-boundary" };
      }
      current = next;
      continue;
    }
    return { status: "unknown", reason: `source-http-${response.status}` };
  }
  return { status: "unknown", reason: "too-many-redirects" };
}
