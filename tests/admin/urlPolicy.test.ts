import { describe, expect, it } from "vitest";
import {
  isApprovedFeedUrl,
  isApprovedOzBargainPostUrl,
  resolveApprovedFeedRedirect,
  safeHttpsUrl,
  safeLogoPath,
  safePublicHref,
} from "@/lib/security/urlPolicy";

describe("public URL policy", () => {
  it("canonicalises safe HTTPS URLs", () => {
    expect(safeHttpsUrl("https://Example.com/path")).toBe(
      "https://example.com/path"
    );
  });

  it.each([
    "http://example.com",
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///etc/passwd",
    "ftp://example.com/file",
    "//example.com/path",
    "https://user:secret@example.com/path",
    "https://example.com:8443/path",
    "https://example.com/path\nnext",
    "not a URL",
  ])("rejects unsafe external URL %s", (value) => {
    expect(safeHttpsUrl(value)).toBeNull();
  });

  it.each(["/", "/resources", "/search?q=gift#results"])(
    "allows local href %s",
    (value) => expect(safePublicHref(value)).toBe(value)
  );

  it.each([
    "//evil.test",
    "/../admin",
    "/%2e%2e/admin",
    "/%2F%2Fevil.test",
    "/%5c%5cevil.test",
    "/path\\file",
  ])("rejects unsafe local href %s", (value) => {
    expect(safePublicHref(value)).toBeNull();
  });

  it("restricts logos to one repository-owned filename", () => {
    expect(safeLogoPath("/logos/myer.png")).toBe("/logos/myer.png");
    expect(safeLogoPath("https://example.com/logo.png")).toBeNull();
    expect(safeLogoPath("/logos/../secret.png")).toBeNull();
    expect(safeLogoPath("/logos/store.png?x=1")).toBeNull();
    expect(safeLogoPath("/logos/nested/store.png")).toBeNull();
  });
});

describe("monitor URL allowlist", () => {
  it.each([
    "https://ozbargain.com.au/deals/feed",
    "https://www.ozbargain.com.au/tag/gift-card/feed",
  ])("allows approved OzBargain host %s", (value) => {
    expect(isApprovedFeedUrl("ozbargain", value)).toBe(true);
  });

  it.each([
    "https://evilozbargain.com.au/feed",
    "https://ozbargain.com.au.attacker.test/feed",
    "https://127.0.0.1/feed",
    "https://localhost/feed",
    "http://www.ozbargain.com.au/feed",
    "https://www.ozbargain.com.au:8443/feed",
  ])("rejects unapproved feed target %s", (value) => {
    expect(isApprovedFeedUrl("ozbargain", value)).toBe(false);
  });

  it("allows same-host relative redirects only", () => {
    const current = "https://www.ozbargain.com.au/deals/feed";
    expect(resolveApprovedFeedRedirect("ozbargain", current, "/feed/new")).toBe(
      "https://www.ozbargain.com.au/feed/new"
    );
    expect(
      resolveApprovedFeedRedirect(
        "ozbargain",
        current,
        "https://ozbargain.com.au/feed"
      )
    ).toBeNull();
    expect(
      resolveApprovedFeedRedirect("ozbargain", current, "http://localhost")
    ).toBeNull();
  });

  it("allows only exact HTTPS OzBargain deal-post URLs for validation", () => {
    expect(
      isApprovedOzBargainPostUrl("https://www.ozbargain.com.au/node/123456")
    ).toBe(true);
    expect(
      isApprovedOzBargainPostUrl("https://www.ozbargain.com.au/node/123?next=/")
    ).toBe(false);
    expect(
      isApprovedOzBargainPostUrl("https://evil.test/node/123456")
    ).toBe(false);
  });
});
