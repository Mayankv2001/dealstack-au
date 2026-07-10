import { describe, expect, it } from "vitest";
import {
  dealIdFromSlug,
  slugifyDealTitle,
  weeklyDealPath,
  weeklyDealSlug,
} from "@/lib/offers/dealSlug";

describe("slugifyDealTitle", () => {
  it("lowercases and hyphenates", () =>
    expect(slugifyDealTitle("Best stack: JB Hi-Fi via Ultimate cards")).toBe(
      "best-stack-jb-hi-fi-via-ultimate-cards"
    ));
  it("collapses runs of punctuation to a single hyphen (never emits --)", () => {
    const slug = slugifyDealTitle("20% off!!  —  (limited) & more");
    expect(slug).toBe("20-off-limited-more");
    expect(slug.includes("--")).toBe(false);
  });
  it("trims leading/trailing hyphens and caps length", () => {
    expect(slugifyDealTitle("...deal...")).toBe("deal");
    const long = slugifyDealTitle("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });
  it("strips diacritics", () =>
    expect(slugifyDealTitle("Pokémon café bonus")).toBe("pokemon-cafe-bonus"));
});

describe("weeklyDealSlug / dealIdFromSlug round trip", () => {
  const deal = {
    id: "wk-2026-06-08-jbhifi-stack",
    title: "Best stack: JB Hi-Fi via discounted Ultimate cards",
  };

  it("round-trips the id through the canonical slug", () => {
    const slug = weeklyDealSlug(deal);
    expect(slug).toBe(
      "best-stack-jb-hi-fi-via-discounted-ultimate-cards--wk-2026-06-08-jbhifi-stack"
    );
    expect(dealIdFromSlug(slug)).toBe(deal.id);
  });

  it("id containing double hyphens still round-trips (first -- wins)", () => {
    const odd = { id: "weird--id--1", title: "Some deal" };
    expect(dealIdFromSlug(weeklyDealSlug(odd))).toBe(odd.id);
  });

  it("accepts a bare id (no separator)", () =>
    expect(dealIdFromSlug("wk-2026-06-08-jbhifi-stack")).toBe(
      "wk-2026-06-08-jbhifi-stack"
    ));

  it("empty/symbol-only titles fall back to the bare id", () =>
    expect(weeklyDealSlug({ id: "wk-1", title: "!!!" })).toBe("wk-1"));

  it("weeklyDealPath prefixes /deals/", () =>
    expect(weeklyDealPath(deal)).toBe(`/deals/${weeklyDealSlug(deal)}`));
});
