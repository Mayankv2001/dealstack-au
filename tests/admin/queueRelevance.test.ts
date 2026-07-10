import { describe, expect, it } from "vitest";
import { assessFeedItem } from "@/lib/admin/queueRelevance";

/**
 * assessFeedItem — the pure heuristic behind the queue's relevance chips.
 * Display-only hint: never imports, rejects, or changes review state.
 */

function item(rawTitle: string, rawSummary = "", categories: string[] = []) {
  return { rawTitle, rawSummary, categories };
}

describe("assessFeedItem", () => {
  it("flags a tracked-store title as high relevance with a suggested merchant", () => {
    const result = assessFeedItem(item("JB Hi-Fi 4K TV deal"));
    expect(result.relevance).toBe("high");
    expect(result.suggestedMerchant).toBe("JB Hi-Fi");
  });

  it("flags a core keyword (gift card) as high relevance", () => {
    const result = assessFeedItem(item("10% off Ultimate gift card at Coles"));
    expect(result.relevance).toBe("high");
  });

  it("flags a generic deal cue as medium relevance", () => {
    const result = assessFeedItem(item("Massive clearance on garden gnomes"));
    expect(result.relevance).toBe("medium");
  });

  it("flags an unrelated item as low relevance", () => {
    const result = assessFeedItem(item("New podcast episode about superannuation"));
    expect(result.relevance).toBe("low");
  });

  it("scores high when the store is mentioned only in the summary, but leaves suggestedMerchant null", () => {
    const result = assessFeedItem(
      item("Weekend roundup", "Also: JB Hi-Fi has a 4K TV deal on")
    );
    expect(result.relevance).toBe("high");
    expect(result.suggestedMerchant).toBeNull();
  });

  it("matches keywords case-insensitively", () => {
    const result = assessFeedItem(item("CASHBACK boost this weekend"));
    expect(result.relevance).toBe("high");
  });
});
