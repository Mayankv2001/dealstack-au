import { describe, expect, it } from "vitest";
import { activeFilterCount, dealsHref, isDiscoverMode, parseDealsParams } from "@/lib/deals/params";

describe("deals URL state", () => {
  it("parses bounded, shareable search/filter/sort/page state", () => {
    const params = parseDealsParams({ q: "  airpods anc  ", view: "community", sort: "price-low", merchant: "jb-hifi", program: "qantas", trust: "community", coupon: "1", stackable: "1", membership: "1", activation: "1", targeted: "1", added: "week", page: "3" });
    expect(params).toMatchObject({ q: "airpods anc", view: "community", sort: "price-low", merchant: "jb-hifi", program: "qantas", trust: "community", coupon: true, stackable: true, membership: true, activation: true, targeted: true, added: "week", page: 3 });
    expect(activeFilterCount(params)).toBe(9);
    expect(isDiscoverMode(params)).toBe(false);
  });

  it("supports legacy links without preserving obsolete parameter names", () => {
    const params = parseDealsParams({ view: "signals", store: "myer", confidence: "confirmed" });
    expect(params.view).toBe("community");
    expect(params.merchant).toBe("myer");
    expect(params.trust).toBe("verified");
    expect(dealsHref(params)).toBe("/deals?view=community&merchant=myer&trust=verified");
  });

  it("drops invalid values and resets pagination when a filter changes", () => {
    const params = parseDealsParams({ view: "bad", sort: "bad", page: "9999" });
    expect(params.page).toBe(1);
    expect(dealsHref({ ...params, page: 4 }, { coupon: true })).toBe("/deals?coupon=1");
  });
});
