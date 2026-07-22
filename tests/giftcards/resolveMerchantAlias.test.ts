import { describe, expect, it } from "vitest";
import { resolveMerchantAlias } from "@/lib/giftcards/resolveMerchantAlias";

describe("exact merchant alias resolution", () => {
  const stores = [
    { id: "nike", name: "Nike", aliases: ["Nike Australia", "Nike.com"] },
    { id: "jb-hifi", name: "JB Hi-Fi", aliases: [] },
  ];

  it.each(["Nike", "Nike Australia", "Nike.com"])("resolves reviewed variant %s", (name) => {
    expect(resolveMerchantAlias(name, stores)).toMatchObject({ state: "resolved", storeId: "nike" });
  });

  it("uses existing punctuation normalisation for JB Hi-Fi", () => {
    expect(resolveMerchantAlias("JB Hi Fi", stores)).toMatchObject({ state: "resolved", storeId: "jb-hifi" });
  });

  it("does not fuzzy-match an unrelated near-name", () => {
    expect(resolveMerchantAlias("Niketown", stores).state).toBe("unresolved");
  });

  it("blocks tied aliases as ambiguous", () => {
    const tied = [...stores, { id: "nike-outlet", name: "Nike Outlet", aliases: ["Nike Australia"] }];
    expect(resolveMerchantAlias("Nike Australia", tied)).toMatchObject({ state: "ambiguous", storeId: null, candidateStoreIds: ["nike", "nike-outlet"] });
  });

  it("tags exact hits with method 'exact'", () => {
    expect(resolveMerchantAlias("Nike", stores)).toMatchObject({
      state: "resolved",
      storeId: "nike",
      method: "exact",
    });
  });
});

describe("typo-tolerant near-match resolution (TASK-SEARCH-001)", () => {
  const stores = [
    { id: "myer", name: "Myer", aliases: [] },
    { id: "chemist-warehouse", name: "Chemist Warehouse", aliases: [] },
    { id: "jb-hifi", name: "JB Hi-Fi", aliases: [] },
  ];

  it("resolves a single-character store-name typo, flagged as a near-match", () => {
    expect(resolveMerchantAlias("myre", stores)).toMatchObject({
      state: "resolved",
      storeId: "myer",
      method: "near-match",
    });
  });

  it("resolves a substitution typo too", () => {
    // 'myar' -> 'myer' is one substitution.
    expect(resolveMerchantAlias("myar", stores)).toMatchObject({
      state: "resolved",
      storeId: "myer",
      method: "near-match",
    });
  });

  it("resolves a longer multi-word alias within distance 2", () => {
    // 'chemsit warehouse' transposes 'is'; length ≥ 6 → threshold 2.
    expect(resolveMerchantAlias("chemsit warehouse", stores)).toMatchObject({
      state: "resolved",
      storeId: "chemist-warehouse",
      method: "near-match",
    });
  });

  it("an exact hit always beats a would-be near-match", () => {
    // 'myer' is exact even though 'myar'-style near neighbours exist.
    const withNeighbour = [...stores, { id: "myar", name: "Myar", aliases: [] }];
    expect(resolveMerchantAlias("myer", withNeighbour)).toMatchObject({
      state: "resolved",
      storeId: "myer",
      method: "exact",
    });
  });

  it("resolves nothing when two different stores tie at the smallest distance", () => {
    // 'bost' is distance 1 from both 'best' and 'bast' → ambiguous near-match
    // must fall through to unresolved (never guess).
    const tied = [
      { id: "best", name: "Best", aliases: [] },
      { id: "bast", name: "Bast", aliases: [] },
    ];
    const resolution = resolveMerchantAlias("bost", tied);
    expect(resolution.state).toBe("unresolved");
    expect(resolution.storeId).toBeNull();
  });

  it("does not near-match a too-distant name", () => {
    expect(resolveMerchantAlias("niketown", stores).state).toBe("unresolved");
  });

  it("does not near-match a query shorter than the minimum length", () => {
    // 'myr' (3 chars) is one edit from 'myer' but below the near-match floor.
    expect(resolveMerchantAlias("myr", stores).state).toBe("unresolved");
  });

  it("leaves an unrelated query unresolved", () => {
    expect(resolveMerchantAlias("zzzzzz", stores).state).toBe("unresolved");
  });
});

