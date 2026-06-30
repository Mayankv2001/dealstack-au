import { describe, expect, it } from "vitest";
import {
  CATEGORY_PRIORITY_KEYWORDS,
  countKeywordHits,
  countNegativeHits,
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

  it("counts high-priority CATEGORY keywords as positive hits", () => {
    // tech, fashion, beauty, automotive and home terms are now positive.
    // (countKeywordHits matches lowercase keywords against its raw input, so the
    // test strings are lowercase — score() lowercases the haystack for callers.)
    expect(countKeywordHits("lg 4k tv with soundbar")).toBeGreaterThanOrEqual(2); // tv, soundbar
    expect(countKeywordHits("nike running sneakers")).toBeGreaterThanOrEqual(1); // sneakers
    expect(countKeywordHits("designer perfume / fragrance set")).toBeGreaterThanOrEqual(2); // perfume, fragrance
    expect(countKeywordHits("car tyre and motor oil bundle")).toBeGreaterThanOrEqual(2); // tyre, motor oil
    expect(countKeywordHits("kitchen cookware set")).toBeGreaterThanOrEqual(2); // kitchen, cookware
  });

  it("no longer penalises fashion / home categories (now priorities)", () => {
    // These used to be negative; they must now be neutral for the penalty count.
    expect(countNegativeHits("generic clothing and footwear sale")).toBe(0);
    expect(countNegativeHits("furniture and bedding clearance")).toBe(0);
  });

  it("counts the new de-prioritised terms (collectibles, gaming pre-orders, liquor, snacks)", () => {
    expect(countNegativeHits("rare anime figurine + funko collectible")).toBe(4);
    expect(countNegativeHits("PS5 pre-order with download code")).toBe(2); // pre-order, download code
    expect(countNegativeHits("premium whisky and wine mystery box")).toBe(2); // whisky, wine
    expect(countNegativeHits("chocolate snack multipack")).toBe(2); // chocolate, snack
    expect(countNegativeHits("in-store only pistachio spread")).toBe(1); // in-store only
    expect(countNegativeHits("qantas points cashback at coles")).toBe(0);
  });

  it("does not penalise legit words that merely contain a term", () => {
    // "configure" contains "figure" but must not trip the collectibles penalty.
    expect(countNegativeHits("configure your new laptop")).toBe(0);
    // bare "gaming" is not penalised — gaming peripherals are ordinary electronics now.
    expect(countNegativeHits("nintendo switch gaming console deal")).toBe(0);
  });

  it("exposes the priority category keywords for reuse in the queue UI", () => {
    expect(CATEGORY_PRIORITY_KEYWORDS).toContain("electronics");
    expect(CATEGORY_PRIORITY_KEYWORDS).toContain("fashion");
    expect(CATEGORY_PRIORITY_KEYWORDS).toContain("perfume");
    expect(CATEGORY_PRIORITY_KEYWORDS).toContain("automotive");
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

  it("ranks a broad unrelated item below a neutral one", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "anime", title: "Limited anime figurine restock" }),
        item({ id: "neutral", title: "Mystery box clearance" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("neutral");
    expect(ranked[1].id).toBe("anime");
    expect(ranked[1].relevance).toBe("low");
  });

  it("ranks a relevant signal above a broad unrelated item", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "junk", title: "Gaming chair + mattress mega sale" }),
        item({ id: "real", title: "Bonus Qantas points on gift card" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("real");
    expect(ranked[0].relevance).toBe("medium");
    expect(ranked[1].relevance).toBe("low");
  });

  it("ranks a high-priority category deal above a de-prioritised liquor deal", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "booze", title: "Premium whisky 12-pack mystery box" }),
        item({ id: "tech", title: "LG 4K TV with soundbar", categories: ["Electrical & Electronics"] }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("tech");
    expect(ranked[0].relevance).toBe("medium");
    expect(ranked[1].id).toBe("booze");
    expect(ranked[1].relevance).toBe("low");
  });

  it("treats a fashion/footwear deal as a genuine (not penalised) signal", () => {
    const ranked = rankTopDeals(
      [item({ id: "shoes", title: "Nike running sneakers + apparel sale" })],
      STORES
    );
    // Previously fashion/footwear were penalised to low; now they are priorities.
    expect(ranked[0].relevance).toBe("medium");
  });

  it("nets penalties against keywords so junk-with-a-keyword still sinks", () => {
    const ranked = rankTopDeals(
      [
        // 1 keyword (gift card) minus 2 penalties (anime, funko) = -1.
        item({ id: "mixed", title: "Anime funko gift card bundle" }),
        // 2 keywords (cashback, points), no penalties = +2.
        item({ id: "clean", title: "Cashback and points boost" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("clean");
    expect(ranked[0].relevance).toBe("medium");
    // Net relevance score is negative, so it drops to low.
    expect(ranked[1].id).toBe("mixed");
    expect(ranked[1].relevance).toBe("low");
  });

  it("keeps a tracked-store match on top despite a penalised term", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "kw", title: "Bonus points and cashback everywhere" }),
        item({ id: "store", title: "JB Hi-Fi gaming headset clearance" }),
      ],
      STORES
    );
    // Store match dominates even with a negative term present.
    expect(ranked[0].id).toBe("store");
    expect(ranked[0].relevance).toBe("high");
    expect(ranked[0].matchedStoreName).toBe("JB Hi-Fi");
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

  it("returns [] for an empty items array", () => {
    expect(rankTopDeals([], STORES)).toHaveLength(0);
  });

  it("returns [] when limit is 0", () => {
    const many = Array.from({ length: 3 }, (_, i) =>
      item({ id: `i${i}`, nativeId: `ozb:${i}` })
    );
    expect(rankTopDeals(many, STORES, 0)).toHaveLength(0);
  });

  it("falls back to fetchedAt for recency when postedAt is null", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "older", postedAt: null, fetchedAt: "2026-06-01T00:00:00Z" }),
        item({ id: "newer", postedAt: null, fetchedAt: "2026-06-20T00:00:00Z" }),
      ],
      STORES
    );
    expect(ranked[0].id).toBe("newer");
    expect(ranked[1].id).toBe("older");
  });

  it("does not crash when both postedAt and fetchedAt are unparseable", () => {
    const ranked = rankTopDeals(
      [
        item({ id: "bad-dates", postedAt: "not-a-date", fetchedAt: "also-bad" }),
        item({ id: "good-dates", postedAt: "2026-06-20T00:00:00Z" }),
      ],
      STORES
    );
    // bad-dates gets recencyMs=0 and falls behind good-dates — but doesn't throw
    expect(ranked[0].id).toBe("good-dates");
    expect(ranked).toHaveLength(2);
  });
});
