import { describe, expect, it } from "vitest";
import {
  feedQueueBrandOptions,
  feedQueueSelectionIds,
  filterFeedQueueItems,
  NO_BRAND_FILTER,
  type FeedQueueFilters,
} from "@/lib/admin/feedQueueFilters";
import {
  detectFeedItemBrands,
  normaliseFeedBrandTag,
} from "@/lib/admin/feedItemBrand";
import { deriveFeedItemMetadata } from "@/lib/admin/feedItemMetadata";
import type { FeedQueueItem } from "@/lib/admin/repos/feedQueue";

function item(
  id: string,
  rawTitle: string,
  categories: string[],
  feedSourceId = "feed-a"
): FeedQueueItem {
  return {
    id,
    feedSourceId,
    feedSourceLabel: "OzBargain deals feed",
    sourceNativeId: `ozb:${id}`,
    link: `https://www.ozbargain.com.au/node/${id}`,
    rawTitle,
    rawSummary: "Reviewed product deal",
    categories,
    contentHash: `hash-${id}`,
    postedAt: "2026-07-11T00:00:00.000Z",
    fetchedAt: "2026-07-11T01:00:00.000Z",
    reviewState: "new",
    promotedSignalId: null,
    hiddenFromHomepage: false,
    thumbnailUrl: null,
    metadata: deriveFeedItemMetadata({
      rawTitle,
      rawSummary: "Reviewed product deal",
      categories,
    }),
    existingSignal: null,
  };
}

const ALL_FILTERS: FeedQueueFilters = {
  source: "",
  brand: "",
  store: "",
  query: "",
  category: "",
  cashbackProvider: "",
  expiringSoon: false,
  presets: [],
  relevance: "",
};

const relevance = new Map<string, { relevance: "high" }>();

describe("feed-item brand derivation", () => {
  it("normalises exact known tags case-insensitively and explicit brand tags", () => {
    expect(normaliseFeedBrandTag(" xIAOMI ")).toBe("Xiaomi");
    expect(normaliseFeedBrandTag("Coach (Brand)")).toBe("Coach");
  });

  it("does not treat retailers, categories, providers or generic words as brands", () => {
    expect(normaliseFeedBrandTag("Amazon")).toBeNull();
    expect(normaliseFeedBrandTag("Electronics")).toBeNull();
    expect(normaliseFeedBrandTag("ShopBack")).toBeNull();
    expect(normaliseFeedBrandTag("Gaming Monitor")).toBeNull();
  });

  it("recognises a known brand prefix on a structured model tag", () => {
    expect(normaliseFeedBrandTag("Xiaomi C34WQDA-RGGL")).toBe("Xiaomi");
    expect(normaliseFeedBrandTag("LG 45GR95QE-B monitor")).toBe("LG");
  });

  it("deduplicates and alphabetises detected brand tags", () => {
    expect(
      detectFeedItemBrands(["xiaomi", "Apple", "Xiaomi", "Gaming", "Bosch"])
    ).toEqual(["Apple", "Bosch", "Xiaomi"]);
  });

  it("extracts dataset options with case-insensitive deduplication and sorting", () => {
    const items = [
      item("1", "Xiaomi monitor", ["Xiaomi"]),
      item("2", "Apple phone", ["apple"]),
      item("3", "Second Xiaomi monitor", ["XIAOMI"]),
      item("4", "Unbranded case", ["Mobile Phone Case"]),
    ];
    expect(feedQueueBrandOptions(items)).toEqual(["Apple", "Xiaomi"]);
  });
});

describe("brand review filtering and selection", () => {
  const items = [
    item("xiaomi-jb", "Xiaomi monitor deal at JB Hi-Fi", ["Xiaomi", "Electronics"]),
    item("xiaomi-amazon", "Xiaomi phone at Amazon", ["Xiaomi", "Mobile"]),
    item("apple-jb", "Apple accessories at JB Hi-Fi", ["Apple", "Electronics"]),
    item("unknown-jb", "Generic cable at JB Hi-Fi", ["Computer Peripheral"]),
  ];

  it("matches brands case-insensitively and leaves no-brand items in All brands", () => {
    expect(
      filterFeedQueueItems(items, { ...ALL_FILTERS, brand: "xIaOmI" }, relevance)
        .map((row) => row.id)
    ).toEqual(["xiaomi-jb", "xiaomi-amazon"]);
    expect(filterFeedQueueItems(items, ALL_FILTERS, relevance)).toHaveLength(4);
    expect(
      filterFeedQueueItems(
        items,
        { ...ALL_FILTERS, brand: NO_BRAND_FILTER },
        relevance
      ).map((row) => row.id)
    ).toEqual(["unknown-jb"]);
  });

  it("AND-composes brand with category, store and search filters", () => {
    const filtered = filterFeedQueueItems(
      items,
      {
        ...ALL_FILTERS,
        brand: "Xiaomi",
        category: "electronics",
        store: "jb-hifi",
        query: "monitor",
      },
      relevance
    );
    expect(filtered.map((row) => row.id)).toEqual(["xiaomi-jb"]);
    expect(filtered).toHaveLength(1);
  });

  it("select-all shown and filtered return only IDs in the brand-filtered view", () => {
    const filtered = filterFeedQueueItems(
      items,
      { ...ALL_FILTERS, brand: "Xiaomi" },
      relevance
    );
    expect(feedQueueSelectionIds(filtered.slice(0, 1), 200)).toEqual([
      "xiaomi-jb",
    ]);
    expect(feedQueueSelectionIds(filtered, 200)).toEqual([
      "xiaomi-jb",
      "xiaomi-amazon",
    ]);
    expect(feedQueueSelectionIds(filtered, 1)).toEqual(["xiaomi-jb"]);
  });
});
