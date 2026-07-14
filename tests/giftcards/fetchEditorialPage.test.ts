import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPointHacksWeeklyPage } from "@/lib/giftcards/fetchEditorialPage";
import { POINT_HACKS_WEEKLY_URL } from "@/lib/giftcards/pointHacksWeekly";

afterEach(() => vi.unstubAllGlobals());

describe("bounded Point Hacks editorial retrieval", () => {
  it("blocks an unapproved URL before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchPointHacksWeeklyPage({
        url: "https://example.com/weekly",
        userAgent: "DealStackAU/1.0",
      }),
    ).resolves.toEqual({ kind: "blocked", reason: "weekly source URL is not approved" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses conditional headers and returns a bounded HTML document", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html><main>Reviewed facts</main>", {
        headers: {
          "content-type": "text/html; charset=utf-8",
          etag: '"weekly-1"',
          "last-modified": "Mon, 13 Jul 2026 00:00:00 GMT",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchPointHacksWeeklyPage({
      url: POINT_HACKS_WEEKLY_URL,
      userAgent: "DealStackAU/1.0",
      etag: '"weekly-0"',
      lastModified: "Sun, 12 Jul 2026 00:00:00 GMT",
    });
    expect(result).toMatchObject({ kind: "ok", etag: '"weekly-1"' });
    expect(fetchMock).toHaveBeenCalledWith(
      POINT_HACKS_WEEKLY_URL,
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
        headers: expect.objectContaining({
          "if-none-match": '"weekly-0"',
          "if-modified-since": "Sun, 12 Jul 2026 00:00:00 GMT",
        }),
      }),
    );
  });

  it("does not bypass a challenge response or an off-domain redirect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/challenge" },
        }),
      ),
    );
    await expect(
      fetchPointHacksWeeklyPage({
        url: POINT_HACKS_WEEKLY_URL,
        userAgent: "DealStackAU/1.0",
      }),
    ).resolves.toEqual({ kind: "blocked", reason: "redirect target is not approved" });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><title>Just a moment</title><div>captcha</div>", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const challenge = await fetchPointHacksWeeklyPage({
      url: POINT_HACKS_WEEKLY_URL,
      userAgent: "DealStackAU/1.0",
    });
    expect(challenge).toEqual({
      kind: "blocked",
      reason: "anti-bot or challenge response; no bypass attempted",
    });
  });

  it("rejects declared oversized bodies without reading them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><main>x</main>", {
          headers: {
            "content-type": "text/html",
            "content-length": "1500001",
          },
        }),
      ),
    );
    const result = await fetchPointHacksWeeklyPage({
      url: POINT_HACKS_WEEKLY_URL,
      userAgent: "DealStackAU/1.0",
    });
    expect(result).toEqual({
      kind: "error",
      reason: "response body exceeds 1500000 byte limit",
    });
  });
});
