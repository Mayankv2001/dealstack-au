const ALLOWED_FEED_HOSTS = new Set([
  "ozbargain.com.au",
  "www.ozbargain.com.au",
]);

export type FeedUrlValidation =
  | { ok: true; url: string }
  | { ok: false; error: string };

/**
 * Strict outbound allowlist for the OzBargain-only monitor. This is enforced
 * both when an admin saves a source and immediately before every request or
 * redirect, so stale database rows cannot become an SSRF path.
 */
export function validateFeedUrl(raw: string): FeedUrlValidation {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Feed URL must be a valid absolute URL." };
  }

  if (url.protocol !== "https:") {
    return { ok: false, error: "Feed URL must use HTTPS." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Feed URL must not contain credentials." };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, error: "Feed URL must use the standard HTTPS port." };
  }
  if (!ALLOWED_FEED_HOSTS.has(url.hostname.toLowerCase())) {
    return {
      ok: false,
      error: "Feed URL must be hosted by ozbargain.com.au.",
    };
  }
  if (url.hash) {
    return { ok: false, error: "Feed URL must not include a fragment." };
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  if (path !== "/rss.xml" && path !== "/feed" && !path.endsWith("/feed")) {
    return {
      ok: false,
      error: "Use an official OzBargain RSS/Atom path ending in /feed or /rss.xml.",
    };
  }

  url.hostname = url.hostname.toLowerCase();
  return { ok: true, url: url.toString() };
}
