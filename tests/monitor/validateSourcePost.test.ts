import { describe, expect, it, vi } from "vitest";
import { validateSourcePost } from "@/lib/monitor/validateSourcePost";

describe("validateSourcePost", () => {
  it("uses HEAD only and treats 2xx as active", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
    await expect(
      validateSourcePost(
        "https://www.ozbargain.com.au/node/123456",
        "DealStackAU/1.0",
        fetcher
      )
    ).resolves.toEqual({ status: "active", reason: null });
    expect(fetcher).toHaveBeenCalledWith(
      "https://www.ozbargain.com.au/node/123456",
      expect.objectContaining({ method: "HEAD", redirect: "manual" })
    );
  });

  it.each([404, 410])("treats HTTP %s as removed", async (status) => {
    const fetcher = vi.fn(async () => new Response(null, { status }));
    await expect(
      validateSourcePost(
        "https://www.ozbargain.com.au/node/123456",
        "DealStackAU/1.0",
        fetcher
      )
    ).resolves.toEqual({ status: "removed", reason: `source-http-${status}` });
  });

  it("does not fetch unsupported but safe non-OzBargain sources", async () => {
    const fetcher = vi.fn();
    await expect(
      validateSourcePost("https://www.costco.com.au/c/hot-buys", "UA", fetcher)
    ).resolves.toEqual({
      status: "unknown",
      reason: "source-status-check-not-supported",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed on an unsafe source URL", async () => {
    const fetcher = vi.fn();
    await expect(
      validateSourcePost("http://127.0.0.1/private", "UA", fetcher)
    ).resolves.toEqual({
      status: "removed",
      reason: "unsafe-or-unapproved-source-url",
    });
  });
});
