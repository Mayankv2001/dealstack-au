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
});

