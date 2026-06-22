import { describe, expect, it } from "vitest";
import {
  countKeywordHits,
  matchStoreName,
  rankTopDeals,
  sourceHostFromUrl,
  type RankableFeedItem,
  type StoreRef,
} from "../../lib/repos/topDealsRanking";

const STORES: StoreRef[] = [
  { id: "myer", name: "Myer" },
  { id: "jb-hifi", name: "JB Hi-Fi" },
  { id: "amazon-au", name: "Amazon AU" },
  { id: "coles", name: "Coles" },
];

function item(over: Partial<RankableFeedItem>): RankableFeedItem {
  return {
    id: "id",
    nativeId: "ozb:1",
    title: "A deal",
    summary: "",
    link: "https://www.ozbargain.com.au/node/1",
    postedAt: "2026-06-20T00:00:00.000Z",
    fetchedAt: "2026-06-20T00:00:00.000Z",
    categories: [],
    ...over,
  };
}

describe("topDealsRanking — helpers", () => {
  it("strips www. for the source host", () => {
    expect(sourceHostFromUrl("https://www.ozbargain.com.au/node/9")).toBe(
      "ozbargain.com.au"
    );
    expect(sourceHostFromUrl("not a url")).toBe("");
  });

  it("matches a tracked store by name, trimming a trailing AU", () => {
    expect(matchStoreName("10% off at jb hi-fi today", STORES)).toBe("JB Hi-Fi");
    // "Amazon AU" should still match a bare "amazon" mention.
    expect(matchStoreName("big amazon price drop", STORES)).toBe("Amazon AU");
    expect(matchStoreName("a generic deal", STORES)).toBeNull();
  });

  it("counts distinct keyword hits", () => {
    expect(
      countKeywordHits("bonus qantas points plus cashback at myer")
    ).toBe(4); // qantas, points, cashback, myer
    expect(countKeywordHits("nothing relevant here")).toBe(0);
  });
});

describe("topDealsRanking — rankTopDeals", () => {
  it("ranks a tracked-store match above a keyword-only item", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "kw", title: "Qantas points bonus" }),
        item({ id: "store", title: "Myer sale this week" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("store");
    expect(ranked[0].relevance).toBe("high");
    expect(ranked[0].matchedStoreName).toBe("Myer");
    expect(ranked[1].relevance).toBe("medium");
  });

  it("ranks more keyword hits above fewer when no store match", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "one", title: "cashback offer" }),
        item({ id: "many", title: "Flybuys + Velocity + gift card + points" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("many");
  });

  it("breaks ties by recency (newest first)", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "old", title: "Coles", postedAt: "2026-06-01T00:00:00Z" }),
        item({ id: "new", title: "Coles", postedAt: "2026-06-21T00:00:00Z" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("new");
  });

  it("marks an item with neither store nor keyword as low relevance", () => {
    const ranked = rankTopDeals([item({ title: "mystery box" })], STORES);
    expect(ranked[0].relevance).toBe("low");
    expect(ranked[0].matchedStoreName).toBeNull();
  });

  it("returns at most the requested limit", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      item({ id: `i${i}`, nativeId: `ozb:${i}` })
    );
    expect(rankTopDeals(many, STORES, 5)).toHaveLength(5);
  });

  it("shapes a safe DTO (host derived, fields mapped)", () => {
    const [deal] = rankTopDeals(
      [
        item({
          id: "x",
          title: "JB Hi-Fi cashback",
          summary: "stack it",
          link: "https://www.ozbargain.com.au/node/42",
          categories: ["electronics"],
        }),
      ],
      STORES
    );
    expect(deal).toMatchObject({
      id: "x",
      title: "JB Hi-Fi cashback",
      summary: "stack it",
      sourceUrl: "https://www.ozbargain.com.au/node/42",
      sourceHost: "ozbargain.com.au",
      nativeId: "ozb:1",
      relevance: "high",
      matchedStoreName: "JB Hi-Fi",
    });
  });
});
