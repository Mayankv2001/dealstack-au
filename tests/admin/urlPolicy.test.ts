import { describe, expect, it } from "vitest";
import {
  isApprovedFeedUrl,
  resolveApprovedFeedRedirect,
  safeHttpsUrl,
  safeLogoPath,
  safePublicHref,
  safePublicSourceUrl,
} from "@/lib/security/urlPolicy";

describe("public URL policy", () => {
  it("canonicalises safe HTTPS URLs", () => {
    expect(safeHttpsUrl("https://Example.com/path")).toBe(
      "https://example.com/path",
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
    (value) => expect(safePublicHref(value)).toBe(value),
  );

  it("rejects known placeholder domains from public source links", () => {
    expect(safePublicSourceUrl("https://example.com/deal")).toBeNull();
    expect(safePublicSourceUrl("https://seller.example/terms")).toBeNull();
    expect(safePublicHref("https://example.org/source")).toBeNull();
    expect(safePublicSourceUrl("https://www.gcdb.com.au/offer/1")).toBe(
      "https://www.gcdb.com.au/offer/1",
    );
  });

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

describe("feed URL allowlist", () => {
  it.each([
    "https://gcdb.com.au/feed/",
    "https://www.gcdb.com.au/category/gift-cards/feed/",
  ])("allows approved GCDB host %s", (value) => {
    expect(isApprovedFeedUrl("gcdb", value)).toBe(true);
  });

  it.each([
    "https://evilgcdb.com.au/feed",
    "https://gcdb.com.au.attacker.test/feed",
    "https://127.0.0.1/feed",
    "https://localhost/feed",
    "http://www.gcdb.com.au/feed",
    "https://www.gcdb.com.au:8443/feed",
  ])("rejects unapproved feed target %s", (value) => {
    expect(isApprovedFeedUrl("gcdb", value)).toBe(false);
  });

  it("allows same-host relative redirects only", () => {
    const current = "https://www.gcdb.com.au/feed/";
    expect(resolveApprovedFeedRedirect("gcdb", current, "/feed/new")).toBe(
      "https://www.gcdb.com.au/feed/new",
    );
    expect(
      resolveApprovedFeedRedirect(
        "gcdb",
        current,
        "https://gcdb.com.au/feed",
      ),
    ).toBeNull();
    expect(
      resolveApprovedFeedRedirect("gcdb", current, "http://localhost"),
    ).toBeNull();
  });
});
