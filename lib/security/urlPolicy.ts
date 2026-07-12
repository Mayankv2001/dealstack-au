const RAW_WHITESPACE_OR_CONTROL = /[\u0000-\u0020\u007f]/;
const APPROVED_FEED_HOSTS: Readonly<Record<string, ReadonlySet<string>>> = {
  ozbargain: new Set(["ozbargain.com.au", "www.ozbargain.com.au"]),
  gcdb: new Set(["gcdb.com.au", "www.gcdb.com.au"]),
};

/** Canonical public HTTPS URL, or null when navigation would be unsafe. */
export function safeHttpsUrl(value: string): string | null {
  if (!value || RAW_WHITESPACE_OR_CONTROL.test(value)) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

/** Safe external HTTPS URL or an application-local root-relative path. */
export function safePublicHref(value: string): string | null {
  if (
    !value ||
    RAW_WHITESPACE_OR_CONTROL.test(value) ||
    value.includes("\\")
  ) {
    return null;
  }

  if (!value.startsWith("/")) return safeHttpsUrl(value);
  if (value.startsWith("//")) return null;

  const path = value.split(/[?#]/, 1)[0];
  try {
    for (const segment of path.split("/")) {
      const decoded = decodeURIComponent(segment);
      if (
        decoded === "." ||
        decoded === ".." ||
        decoded.includes("/") ||
        decoded.includes("\\")
      ) {
        return null;
      }
    }
  } catch {
    return null;
  }

  return value;
}

/** Store logos are repository-owned files, never arbitrary remote images. */
export function safeLogoPath(value: string | null): string | null {
  if (!value || safePublicHref(value) !== value) return null;
  if (value.includes("?") || value.includes("#")) return null;
  return !value.includes("..") &&
    /^\/logos\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)
    ? value
    : null;
}

/** True only for a fetch-approved source type and its exact approved HTTPS host. */
export function isApprovedFeedUrl(sourceType: string, value: string): boolean {
  const canonical = safeHttpsUrl(value);
  if (!canonical) return false;
  const approvedHosts = APPROVED_FEED_HOSTS[sourceType];
  if (!approvedHosts) return false;

  const url = new URL(canonical);
  return approvedHosts.has(url.hostname.toLowerCase());
}

/** Exact OzBargain deal-post URL permitted for status-only HEAD validation. */
export function isApprovedOzBargainPostUrl(value: string): boolean {
  const canonical = safeHttpsUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  return (
    APPROVED_FEED_HOSTS.ozbargain.has(url.hostname.toLowerCase()) &&
    /^\/node\/\d+\/?$/.test(url.pathname) &&
    url.search === "" &&
    url.hash === ""
  );
}

/** Resolve and validate one feed redirect without exposing the target to callers. */
export function resolveApprovedFeedRedirect(
  sourceType: string,
  currentUrl: string,
  location: string
): string | null {
  if (!location || RAW_WHITESPACE_OR_CONTROL.test(location)) return null;
  try {
    const current = new URL(currentUrl);
    const resolved = new URL(location, current);
    return isApprovedFeedUrl(sourceType, resolved.href) &&
      resolved.hostname.toLowerCase() === current.hostname.toLowerCase()
      ? resolved.href
      : null;
  } catch {
    return null;
  }
}
