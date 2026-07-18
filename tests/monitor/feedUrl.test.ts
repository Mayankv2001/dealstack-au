import { describe, expect, it } from "vitest";
import { validateFeedUrl } from "../../lib/monitor/feedUrl";

describe("validateFeedUrl", () => {
  it.each([
    "https://www.ozbargain.com.au/feed",
    "https://www.ozbargain.com.au/deals/popular/feed",
    "https://ozbargain.com.au/rss.xml",
  ])("accepts an official feed path: %s", (url) => {
    expect(validateFeedUrl(url).ok).toBe(true);
  });

  it.each([
    "http://www.ozbargain.com.au/feed",
    "https://example.com/feed",
    "https://127.0.0.1/feed",
    "https://www.ozbargain.com.au:8443/feed",
    "https://user:pass@www.ozbargain.com.au/feed",
    "https://www.ozbargain.com.au/deals",
  ])("rejects an unsafe or non-feed URL: %s", (url) => {
    expect(validateFeedUrl(url).ok).toBe(false);
  });
});
