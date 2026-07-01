import { describe, expect, it } from "vitest";
import {
  DEAL_CATEGORIES,
  DEAL_CATEGORY_KEYWORDS,
  DEAL_CATEGORY_LABELS,
  type DealCategory,
} from "../../lib/dealCategories";

describe("dealCategories taxonomy", () => {
  it("has a label for every category", () => {
    for (const category of DEAL_CATEGORIES) {
      expect(DEAL_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });

  it("has a non-empty keyword list for every category", () => {
    for (const category of DEAL_CATEGORIES) {
      expect(DEAL_CATEGORY_KEYWORDS[category].length).toBeGreaterThan(0);
    }
  });

  it("keeps keywords lowercased (matchers assume this)", () => {
    for (const category of DEAL_CATEGORIES) {
      for (const keyword of DEAL_CATEGORY_KEYWORDS[category]) {
        expect(keyword).toBe(keyword.toLowerCase());
      }
    }
  });

  it("does not reference Cashrewards anywhere in the taxonomy", () => {
    const allKeywords = DEAL_CATEGORIES.flatMap(
      (c) => DEAL_CATEGORY_KEYWORDS[c]
    );
    const allLabels = DEAL_CATEGORIES.map((c) => DEAL_CATEGORY_LABELS[c]);
    for (const text of [...allKeywords, ...allLabels]) {
      expect(text.toLowerCase()).not.toContain("cashrewards");
    }
  });

  it("exposes the exact 13 categories from the expansion plan", () => {
    const expected: DealCategory[] = [
      "credit_card_bonus",
      "bank_offer",
      "cashback",
      "gift_card",
      "grocery",
      "automotive",
      "electronics",
      "beauty",
      "fashion",
      "household",
      "dining_delivery",
      "travel_rewards",
      "points_rewards",
    ];
    expect([...DEAL_CATEGORIES].sort()).toEqual([...expected].sort());
  });
});
