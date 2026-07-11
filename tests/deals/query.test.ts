import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, PAGE_SIZE } from "@/lib/deals/params";
import { dedupeDeals, filterActive, groupDeals, queryDeals, sortItems } from "@/lib/deals/query";
import type { PublicDeal } from "@/lib/deals/types";

const NOW = new Date("2026-07-12T12:00:00+10:00");

function deal(over: Partial<PublicDeal> = {}): PublicDeal {
  const base: PublicDeal = { id: "community:1", kind: "community", title: "AirPods 4 ANC sale", summary: "Current Apple earbuds offer", merchantId: "jb-hifi", merchantName: "JB Hi-Fi", category: "Audio", tags: ["Apple", "Earbuds"], priceText: "$207", priceValue: 207, wasPrice: 299, savingPercent: 31, couponCode: null, trust: "community", membershipRequired: false, activationRequired: false, targeted: false, channelNote: "Online", postedAt: "2026-07-12T01:00:00Z", lastCheckedAt: "2026-07-12T02:00:00Z", expiryDate: "2026-07-15", sourceName: "OzBargain", sourceUrl: "https://www.ozbargain.com.au/node/1", detailPath: "/deals/signal/1", stackable: true, productGroup: null, sourceNativeId: "ozb:1", votes: 20, comments: 4, searchText: "airpods 4 anc sale current apple earbuds offer jb hi-fi audio apple earbuds ozbargain", score: 80 };
  return { ...base, ...over };
}

describe("deals query engine", () => {
  it("tokenises search and combines supported filters", () => {
    const result = queryDeals([deal(), deal({ id: "community:2", title: "TV sale", searchText: "tv sale", sourceNativeId: "ozb:2", couponCode: "SAVE", targeted: true })], { ...DEFAULT_PARAMS, q: "apple airpods", stackable: true }, NOW);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("excludes expired records using the AU calendar boundary", () => {
    expect(filterActive([deal({ expiryDate: "2026-07-11" }), deal({ id: "community:2", sourceNativeId: "ozb:2", expiryDate: "2026-07-12" })], NOW).map((item) => item.id)).toEqual(["community:2"]);
  });

  it("never deduplicates distinct targeted or membership conditions", () => {
    const publicDeal = deal({ sourceNativeId: null });
    const targeted = deal({ id: "community:2", sourceNativeId: null, targeted: true });
    const member = deal({ id: "community:3", sourceNativeId: null, membershipRequired: true });
    expect(dedupeDeals([publicDeal, targeted, member])).toHaveLength(3);
  });

  it("groups only admin-assigned products with compatible conditions", () => {
    const options = [deal({ productGroup: "airpods-4-anc" }), deal({ id: "community:2", sourceNativeId: "ozb:2", merchantId: "amazon", merchantName: "Amazon", productGroup: "airpods-4-anc", priceValue: 219 })];
    expect(groupDeals(options)[0].type).toBe("group");
    expect(groupDeals([options[0], { ...options[1], targeted: true }])).toHaveLength(2);
  });

  it("sorts missing prices last and clamps pages beyond the result set", () => {
    const items = [{ type: "deal" as const, deal: deal({ priceValue: null }) }, { type: "deal" as const, deal: deal({ id: "community:2", sourceNativeId: "ozb:2", priceValue: 10 }) }];
    const first = sortItems(items, "price-low")[0];
    expect(first.type).toBe("deal");
    if (first.type === "deal") expect(first.deal.id).toBe("community:2");
    const many = Array.from({ length: PAGE_SIZE + 1 }, (_, index) => deal({ id: `community:${index}`, sourceNativeId: `ozb:${index}`, title: `Deal ${index}`, searchText: `deal ${index}` }));
    const result = queryDeals(many, { ...DEFAULT_PARAMS, view: "top", page: 500 }, NOW);
    expect(result.page).toBe(2);
    expect(result.items).toHaveLength(1);
  });
});
