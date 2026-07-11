import { describe, expect, it } from "vitest";
import { classifyFeedChanges } from "@/lib/monitor/classifyFeedChanges";
import type { FeedItemInsert } from "@/lib/monitor/mapFeedItem";

function item(id: string, hash: string): FeedItemInsert {
  return {
    source_native_id: id,
    link: `https://www.ozbargain.com.au/node/${id}`,
    raw_title: id,
    raw_summary: id,
    categories: [],
    posted_at: null,
    content_hash: hash,
    thumbnail_url: null,
    declared_expires_at: null,
    source_marked_expired: false,
  };
}

describe("classifyFeedChanges", () => {
  it("separates new, changed and unchanged rows", () => {
    const result = classifyFeedChanges(
      [item("1", "same"), item("2", "new-hash"), item("3", "first")],
      [
        { sourceNativeId: "1", contentHash: "same", reviewState: "rejected", link: "https://old/1" },
        { sourceNativeId: "2", contentHash: "old-hash", reviewState: "imported", link: "https://old/2" },
      ]
    );
    expect(result).toMatchObject({ inserted: 1, updated: 1, skipped: 1 });
    expect(result.changes.map((change) => change.item.source_native_id)).toEqual([
      "2",
      "3",
    ]);
    expect(result.changes[0].previousReviewState).toBe("imported");
  });

  it("skips a new GUID when its content hash or canonical link already exists", () => {
    const result = classifyFeedChanges(
      [item("new-guid", "same-content")],
      [
        {
          sourceNativeId: "old-guid",
          contentHash: "same-content",
          reviewState: "imported",
          link: "https://www.ozbargain.com.au/node/old",
        },
      ]
    );
    expect(result).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });
    expect(result.changes).toEqual([]);
  });

  it("keeps only the first occurrence of a repeated native id in one batch", () => {
    const first = item("same-guid", "first-hash");
    const changedDuplicate = {
      ...item("same-guid", "second-hash"),
      link: "https://www.ozbargain.com.au/node/999",
    };
    const result = classifyFeedChanges([first, changedDuplicate], []);

    expect(result).toMatchObject({ inserted: 1, updated: 0, skipped: 1 });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].item.content_hash).toBe("first-hash");
  });
});
