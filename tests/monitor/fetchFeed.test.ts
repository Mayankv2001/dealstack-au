import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyBody,
  fetchFeed,
  MAX_FEED_BYTES,
} from "../../lib/monitor/fetchFeed";

const RSS = '<?xml version="1.0"?><rss version="2.0"><channel></channel></rss>';

describe("classifyBody", () => {
  it("recognises an RSS feed", () => {
    expect(classifyBody(RSS)).toBe("feed");
  });

  it("recognises an Atom feed", () => {
    expect(
      classifyBody('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')
    ).toBe("feed");
  });

  it("flags a plain HTML page", () => {
    expect(classifyBody("<!DOCTYPE html><html><body>hi</body></html>")).toBe(
      "html"
    );
  });

  it("flags a Cloudflare challenge page", () => {
    expect(classifyBody("<html><title>Just a moment...</title></html>")).toBe(
      "cloudflare"
    );
  });

  it("flags non-XML junk", () => {
    expect(classifyBody("totally not a feed")).toBe("non-xml");
  });
});

describe("fetchFeed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: string | null, headers?: HeadersInit) {
    const mock = vi.fn(
      async () => new Response(body, { status, headers })
    );
    vi.stubGlobal("fetch", mock);
    return mock;
  }

  it("returns ok with body + caching headers on a 200 feed", async () => {
    stubFetch(200, RSS, {
      etag: 'W/"abc"',
      "last-modified": "Wed, 10 Jun 2026 00:00:00 GMT",
      "content-type": "application/rss+xml",
    });
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("ok");
    if (out.kind === "ok") {
      expect(out.etag).toBe('W/"abc"');
      expect(out.lastModified).toBe("Wed, 10 Jun 2026 00:00:00 GMT");
      expect(out.body).toContain("<rss");
    }
  });

  it("returns not-modified on a 304", async () => {
    stubFetch(304, null, { etag: 'W/"abc"' });
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
      etag: 'W/"abc"',
    });
    expect(out.kind).toBe("not-modified");
  });

  it("treats an HTML 200 body as blocked (not a feed)", async () => {
    stubFetch(200, "<!DOCTYPE html><html></html>", {
      "content-type": "text/html",
    });
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("blocked");
  });

  it("treats a Cloudflare 403 challenge as blocked", async () => {
    stubFetch(403, "<html><title>Just a moment...</title></html>");
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("blocked");
  });

  it("treats a plain 500 as an error carrying the status", async () => {
    stubFetch(500, "upstream error");
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.httpStatus).toBe(500);
  });

  it("sends the identifying UA and conditional-GET headers", async () => {
    const mock = stubFetch(200, RSS);
    await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
      etag: 'W/"x"',
      lastModified: "Wed, 10 Jun 2026 00:00:00 GMT",
    });
    expect(mock).toHaveBeenCalledWith(
      "https://www.ozbargain.com.au/feed",
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        headers: expect.objectContaining({
          "user-agent": "DealStackAU/1.0",
          "if-none-match": 'W/"x"',
          "if-modified-since": "Wed, 10 Jun 2026 00:00:00 GMT",
        }),
      })
    );
  });

  it("rejects a non-allowlisted destination before making a request", async () => {
    const mock = vi.fn();
    vi.stubGlobal("fetch", mock);
    const out = await fetchFeed({
      feedUrl: "https://127.0.0.1/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("blocked");
    expect(mock).not.toHaveBeenCalled();
  });

  it("blocks a redirect that leaves the approved host allowlist", async () => {
    const mock = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/feed" },
      })
    );
    vi.stubGlobal("fetch", mock);
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("blocked");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("follows an allowlisted relative redirect", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "/deals/feed" } })
      )
      .mockResolvedValueOnce(
        new Response(RSS, {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        })
      );
    vi.stubGlobal("fetch", mock);
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("ok");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(mock.mock.calls[1][0]).toBe(
      "https://www.ozbargain.com.au/deals/feed"
    );
  });

  it("blocks a feed whose declared response size exceeds the limit", async () => {
    stubFetch(200, RSS, {
      "content-type": "application/rss+xml",
      "content-length": String(MAX_FEED_BYTES + 1),
    });
    const out = await fetchFeed({
      feedUrl: "https://www.ozbargain.com.au/feed",
      userAgent: "DealStackAU/1.0",
    });
    expect(out.kind).toBe("blocked");
  });
});
