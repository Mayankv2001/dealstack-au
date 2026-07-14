import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  dealsHref,
  isDiscoverMode,
  parseDealsParams,
} from "@/lib/deals/params";

describe("deals URL state", () => {
  it("parses bounded, shareable search/filter/sort/page state", () => {
    const params = parseDealsParams({
      q: "  airpods anc  ",
      view: "community",
      sort: "price-low",
      merchant: "jb-hifi",
      program: "qantas",
      trust: "community",
      coupon: "1",
      stackable: "1",
      membership: "1",
      activation: "1",
      targeted: "1",
      added: "week",
      page: "3",
    });
    expect(params).toMatchObject({
      q: "airpods anc",
      view: "discover",
      kind: "community",
      sort: "price-low",
      merchant: "jb-hifi",
      program: "qantas",
      trust: "community",
      coupon: true,
      stackable: true,
      membership: true,
      activation: true,
      targeted: true,
      added: "week",
      page: 3,
    });
    expect(activeFilterCount(params)).toBe(10);
    expect(isDiscoverMode(params)).toBe(false);
  });

  it("supports legacy links without preserving obsolete parameter names", () => {
    const params = parseDealsParams({
      view: "signals",
      store: "myer",
      confidence: "confirmed",
    });
    expect(params.view).toBe("discover");
    expect(params.kind).toBe("community");
    expect(params.merchant).toBe("myer");
    expect(params.trust).toBe("verified");
    expect(dealsHref(params)).toBe(
      "/deals?merchant=myer&trust=verified&kind=community",
    );
  });

  it("drops invalid values and resets pagination when a filter changes", () => {
    const params = parseDealsParams({ view: "bad", sort: "bad", page: "9999" });
    expect(params.page).toBe(1);
    expect(dealsHref({ ...params, page: 4 }, { coupon: true })).toBe(
      "/deals?coupon=1",
    );
  });
});

describe("spend parameter", () => {
  it("defaults to $500 and clamps custom values to the allowed range", () => {
    expect(parseDealsParams({}).spend).toBe(500);
    expect(parseDealsParams({ spend: "250" }).spend).toBe(250);
    expect(parseDealsParams({ spend: "7" }).spend).toBe(50);
    expect(parseDealsParams({ spend: "999999" }).spend).toBe(20000);
    expect(parseDealsParams({ spend: "banana" }).spend).toBe(500);
  });

  it("keeps spend in stack URLs and out of default ones", () => {
    const params = parseDealsParams({ view: "stacks", spend: "250" });
    expect(dealsHref(params, {})).toContain("spend=250");
    expect(dealsHref(parseDealsParams({ view: "stacks" }), {})).not.toContain(
      "spend=",
    );
  });

  it("does not leave discover mode just because spend changed", () => {
    expect(isDiscoverMode(parseDealsParams({ spend: "250" }))).toBe(true);
  });
});
