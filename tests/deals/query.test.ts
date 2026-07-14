import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, PAGE_SIZE } from "@/lib/deals/params";
import {
  dedupeDeals,
  filterActive,
  groupDeals,
  isStrictlyVerifiedDeal,
  queryDeals,
  sortItems,
} from "@/lib/deals/query";
import type { PublicDeal } from "@/lib/deals/types";

const NOW = new Date("2026-07-12T12:00:00+10:00");

function deal(over: Partial<PublicDeal> = {}): PublicDeal {
  const base: PublicDeal = {
    id: "community:1",
    kind: "community",
    title: "AirPods 4 ANC sale",
    summary: "Current Apple earbuds offer",
    merchantId: "jb-hifi",
    merchantName: "JB Hi-Fi",
    category: "Audio",
    tags: ["Apple", "Earbuds"],
    priceText: "$207",
    priceValue: 207,
    wasPrice: 299,
    savingPercent: 31,
    couponCode: null,
    trust: "community",
    dealStackVerified: false,
    membershipRequired: false,
    activationRequired: false,
    targeted: false,
    channelNote: "Online",
    postedAt: "2026-07-12T01:00:00Z",
    lastCheckedAt: "2026-07-12T02:00:00Z",
    expiryDate: "2026-07-15",
    dateStatus: "confirmed-current",
    sourceName: "OzBargain",
    publisherFamily: "ozbargain",
    capturedAt: "2026-07-12T02:00:00Z",
    sourceUrl: "https://www.ozbargain.com.au/node/1",
    detailPath: "/deals/signal/1",
    stackable: true,
    productGroup: null,
    sourceNativeId: "ozb:1",
    votes: 20,
    comments: 4,
    searchText:
      "airpods 4 anc sale current apple earbuds offer jb hi-fi audio apple earbuds ozbargain",
    score: 80,
  };
  return { ...base, ...over };
}

describe("deals query engine", () => {
  it("tokenises search and combines supported filters", () => {
    const result = queryDeals(
      [
        deal(),
        deal({
          id: "community:2",
          title: "TV sale",
          searchText: "tv sale",
          sourceNativeId: "ozb:2",
          couponCode: "SAVE",
          targeted: true,
        }),
      ],
      { ...DEFAULT_PARAMS, q: "apple airpods", stackable: true },
      NOW,
    );
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("excludes expired records using the AU calendar boundary", () => {
    expect(
      filterActive(
        [
          deal({ expiryDate: "2026-07-11" }),
          deal({
            id: "community:2",
            sourceNativeId: "ozb:2",
            expiryDate: "2026-07-12",
          }),
        ],
        NOW,
      ).map((item) => item.id),
    ).toEqual(["community:2"]);
  });

  it("never deduplicates distinct targeted or membership conditions", () => {
    const publicDeal = deal({ sourceNativeId: null });
    const targeted = deal({
      id: "community:2",
      sourceNativeId: null,
      targeted: true,
    });
    const member = deal({
      id: "community:3",
      sourceNativeId: null,
      membershipRequired: true,
    });
    expect(dedupeDeals([publicDeal, targeted, member])).toHaveLength(3);
  });

  it("groups only admin-assigned products with compatible conditions", () => {
    const options = [
      deal({ productGroup: "airpods-4-anc" }),
      deal({
        id: "community:2",
        sourceNativeId: "ozb:2",
        merchantId: "amazon",
        merchantName: "Amazon",
        productGroup: "airpods-4-anc",
        priceValue: 219,
      }),
    ];
    expect(groupDeals(options)[0].type).toBe("group");
    expect(
      groupDeals([options[0], { ...options[1], targeted: true }]),
    ).toHaveLength(2);
  });

  it("sorts missing prices last and clamps pages beyond the result set", () => {
    const items = [
      { type: "deal" as const, deal: deal({ priceValue: null }) },
      {
        type: "deal" as const,
        deal: deal({
          id: "community:2",
          sourceNativeId: "ozb:2",
          priceValue: 10,
        }),
      },
    ];
    const first = sortItems(items, "price-low")[0];
    expect(first.type).toBe("deal");
    if (first.type === "deal") expect(first.deal.id).toBe("community:2");
    const many = Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
      deal({
        id: `community:${index}`,
        sourceNativeId: `ozb:${index}`,
        title: `Deal ${index}`,
        searchText: `deal ${index}`,
      }),
    );
    const result = queryDeals(
      many,
      { ...DEFAULT_PARAMS, view: "discover", page: 500 },
      NOW,
    );
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(1);
  });

  it("uses community heat only inside a trust tier", () => {
    const viralCommunity = deal({
      id: "community:viral",
      trust: "community",
      score: 100,
      votes: 10_000,
    });
    const modestVerified = deal({
      id: "gift-card:verified",
      kind: "gift-card",
      trust: "verified",
      score: 45,
      votes: null,
    });
    const [first] = sortItems(
      [
        { type: "deal" as const, deal: viralCommunity },
        { type: "deal" as const, deal: modestVerified },
      ],
      "recommended",
    );
    expect(first.type).toBe("deal");
    if (first.type === "deal") expect(first.deal.id).toBe("gift-card:verified");
  });

  it("makes the Recently checked view deterministic regardless of the selected sort", () => {
    const olderCheck = deal({
      id: "older",
      sourceNativeId: "older",
      lastCheckedAt: "2026-07-10T00:00:00Z",
      score: 100,
    });
    const newerCheck = deal({
      id: "newer",
      sourceNativeId: "newer",
      lastCheckedAt: "2026-07-12T00:00:00Z",
      score: 1,
    });
    const result = queryDeals(
      [olderCheck, newerCheck],
      { ...DEFAULT_PARAMS, view: "recent", sort: "recommended" },
      NOW,
    );
    const first = result.items[0];
    expect(first.type).toBe("deal");
    if (first.type === "deal") expect(first.deal.id).toBe("newer");
  });

  it("orders the Popular view by captured discussion without treating heat as verification", () => {
    const moreVotes = deal({
      id: "more-votes",
      sourceNativeId: "more-votes",
      votes: 500,
      comments: 3,
    });
    const moreDiscussion = deal({
      id: "more-discussion",
      sourceNativeId: "more-discussion",
      votes: 5,
      comments: 40,
    });
    const result = queryDeals(
      [moreVotes, moreDiscussion],
      { ...DEFAULT_PARAMS, view: "popular" },
      NOW,
    );
    expect(result.items[0]).toMatchObject({
      type: "deal",
      deal: { id: "more-discussion", trust: "community" },
    });
  });

  it("filters by channel, ending window and a recorded minimum saving", () => {
    const result = queryDeals(
      [
        deal(),
        deal({
          id: "too-late",
          sourceNativeId: "too-late",
          expiryDate: "2026-07-20",
        }),
        deal({
          id: "in-store",
          sourceNativeId: "in-store",
          channelNote: "In-store",
        }),
        deal({
          id: "small-saving",
          sourceNativeId: "small-saving",
          savingPercent: 4,
        }),
      ],
      {
        ...DEFAULT_PARAMS,
        channel: "online",
        ending: "72h",
        minSaving: 10,
      },
      NOW,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: "deal",
      deal: { id: "community:1" },
    });
  });

  it("limits Best verified to current, fresh, evidenced DealStack outcomes", () => {
    const verified = deal({
      id: "verified-current",
      kind: "gift-card",
      trust: "verified",
      dealStackVerified: true,
      lastCheckedAt: "2026-07-11T00:00:00Z",
      expiryDate: "2026-07-20",
      dateStatus: "confirmed-current",
      sourceUrl: "https://www.gcdb.com.au/offer/current",
    });
    const needsRecheck = {
      ...verified,
      id: "needs-recheck",
      sourceNativeId: "needs-recheck",
      lastCheckedAt: "2026-06-01T00:00:00Z",
    };
    const unknownDate = {
      ...verified,
      id: "unknown-date",
      sourceNativeId: "unknown-date",
      expiryDate: null,
      dateStatus: "unknown" as const,
    };
    const sourceConfirmedOnly = {
      ...verified,
      id: "source-confirmed",
      sourceNativeId: "source-confirmed",
      dealStackVerified: false,
    };
    const missingSource = {
      ...verified,
      id: "missing-source",
      sourceNativeId: "missing-source",
      sourceUrl: null,
    };
    const expired = {
      ...verified,
      id: "expired",
      sourceNativeId: "expired",
      expiryDate: "2026-07-11",
      dateStatus: "expired" as const,
    };

    expect(isStrictlyVerifiedDeal(verified, NOW)).toBe(true);
    const result = queryDeals(
      [
        needsRecheck,
        unknownDate,
        sourceConfirmedOnly,
        expired,
        missingSource,
        verified,
      ],
      { ...DEFAULT_PARAMS, view: "top", trust: "verified" },
      NOW,
    );
    expect(
      result.items.map((item) =>
        item.type === "deal" ? item.deal.id : item.group.productGroup,
      ),
    ).toEqual(["verified-current"]);
  });

  it("applies strict verified semantics to trust=verified outside the top view", () => {
    const sourceConfirmedOnly = deal({
      id: "source-confirmed",
      kind: "gift-card",
      trust: "verified",
      dealStackVerified: false,
      sourceUrl: "https://www.gcdb.com.au/offer/current",
    });
    const result = queryDeals(
      [sourceConfirmedOnly],
      { ...DEFAULT_PARAMS, view: "discover", trust: "verified" },
      NOW,
    );
    expect(result.total).toBe(0);
  });

  it("ranks confirmed-current records above comparable unknown-date records", () => {
    const unknown = deal({
      id: "unknown",
      sourceNativeId: "unknown",
      dateStatus: "unknown",
      expiryDate: null,
      score: 100,
      postedAt: "2026-07-12T10:00:00Z",
    });
    const current = deal({
      id: "current",
      sourceNativeId: "current",
      dateStatus: "confirmed-current",
      expiryDate: "2026-07-20",
      score: 1,
      postedAt: "2026-07-10T10:00:00Z",
    });
    const sorted = sortItems(
      [
        { type: "deal", deal: unknown },
        { type: "deal", deal: current },
      ],
      "recommended",
      NOW,
    );
    expect(sorted[0]).toMatchObject({ type: "deal", deal: { id: "current" } });
  });

  it("does not let an unknown-date unverified record outrank a comparable current one", () => {
    const current = deal({
      id: "current-unverified",
      sourceNativeId: "current-unverified",
      trust: "source-checked",
      dateStatus: "confirmed-current",
      score: 5,
    });
    const unknown = deal({
      id: "unknown-unverified",
      sourceNativeId: "unknown-unverified",
      trust: "source-checked",
      dateStatus: "unknown",
      expiryDate: null,
      score: 99,
    });
    const sorted = sortItems(
      [
        { type: "deal", deal: unknown },
        { type: "deal", deal: current },
      ],
      "recommended",
      NOW,
    );
    expect(sorted[0]).toMatchObject({
      type: "deal",
      deal: { id: "current-unverified" },
    });
  });

  it("keeps equal-status ordering stable", () => {
    const first = deal({ id: "first", sourceNativeId: "first" });
    const second = deal({ id: "second", sourceNativeId: "second" });
    const sorted = sortItems(
      [
        { type: "deal", deal: first },
        { type: "deal", deal: second },
      ],
      "recommended",
      NOW,
    );
    expect(
      sorted.map((item) => (item.type === "deal" ? item.deal.id : "")),
    ).toEqual(["first", "second"]);
  });

  it("keeps unknown-date offers in All deals but out of Expiring", () => {
    const unknown = deal({
      id: "unknown",
      sourceNativeId: "unknown",
      expiryDate: null,
      dateStatus: "unknown",
    });
    expect(
      queryDeals([unknown], { ...DEFAULT_PARAMS, view: "discover" }, NOW).total,
    ).toBe(1);
    expect(
      queryDeals([unknown], { ...DEFAULT_PARAMS, view: "expiring" }, NOW).total,
    ).toBe(0);
  });
});
