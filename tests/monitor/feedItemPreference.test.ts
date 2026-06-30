import { describe, expect, it } from "vitest";
import {
  classifyFeedItemPreference,
  feedItemReviewState,
  type PreferenceInput,
} from "../../lib/monitor/feedItemPreference";

/** Build a PreferenceInput from a title (+ optional summary/categories). */
function item(
  raw_title: string,
  over: Partial<PreferenceInput> = {}
): PreferenceInput {
  return { raw_title, raw_summary: "", categories: [], ...over };
}

describe("classifyFeedItemPreference — preferred categories", () => {
  it("classifies electronics as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Sony WH-1000XM5 Headphones $399", {
          categories: ["Electrical & Electronics"],
        })
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("HP OmniBook 16\" laptop $1529 @ HP"))
    ).toBe("preferred");
  });

  it("classifies fashion / footwear as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Nike running sneakers $89", { categories: ["Fashion & Apparel"] })
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Macpac Halo Down Puffer Jacket $99"))
    ).toBe("preferred");
  });

  it("classifies gift cards / vouchers as preferred", () => {
    expect(
      classifyFeedItemPreference(item("$100 Coles gift card for $90"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("20% off experience voucher"))
    ).toBe("preferred");
  });

  it("classifies perfume / beauty as preferred", () => {
    expect(
      classifyFeedItemPreference(item("Dior Sauvage fragrance / perfume 100ml"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("CeraVe skincare bundle", { categories: ["Health & Beauty"] })
      )
    ).toBe("preferred");
  });

  it("classifies automotive as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Nulon motor oil 5L $35", { categories: ["Automotive"] })
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Bridgestone tyres 4-pack deal"))
    ).toBe("preferred");
  });

  it("classifies household / appliances / tools as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Royal Doulton dinner set", { categories: ["Home & Garden"] })
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Philips air fryer XXL $179"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Full Boar nail gun + tools @ Bunnings"))
    ).toBe("preferred");
  });
});

describe("classifyFeedItemPreference — non-preferred categories", () => {
  it("ignores alcohol / liquor", () => {
    expect(
      classifyFeedItemPreference(
        item("Premium whisky 12-pack mystery box", { categories: ["Alcohol"] })
      )
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("Secret Premium Cabernet wine 12-pack"))
    ).toBe("non_preferred");
  });

  it("ignores anime / collectibles", () => {
    expect(
      classifyFeedItemPreference(item("Limited anime figurine restock"))
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("Funko Pop collectible 3-pack"))
    ).toBe("non_preferred");
  });

  it("ignores gaming pre-orders / digital keys", () => {
    expect(
      classifyFeedItemPreference(
        item("[Pre Order, PS5] Grand Theft Auto VI (Download Code in Box)")
      )
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("Elden Ring steam key $29"))
    ).toBe("non_preferred");
  });

  it("ignores low-value grocery snacks", () => {
    expect(
      classifyFeedItemPreference(item("Cadbury chocolate snack multipack $5"))
    ).toBe("non_preferred");
  });

  it("ignores supplements / vitamins, dining, pets and travel", () => {
    expect(
      classifyFeedItemPreference(item("Optimum protein powder 2kg"))
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("Cheap vitamins and supplements sale"))
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("$50 restaurant dining voucher deal"))
    ).not.toBe("non_preferred"); // "voucher" is preferred → not ignored
    expect(
      classifyFeedItemPreference(item("Premium dog food 15kg"))
    ).toBe("non_preferred");
    expect(
      classifyFeedItemPreference(item("Cheap flights to Bali + hotel"))
    ).toBe("non_preferred");
  });
});

describe("classifyFeedItemPreference — uncertain & overrides", () => {
  it("treats an unclear item as uncertain (kept for review)", () => {
    expect(classifyFeedItemPreference(item("Mystery box surprise deal"))).toBe(
      "uncertain"
    );
  });

  it("lets a preferred CATEGORY override an incidental negative word", () => {
    // A TV deal that mentions a bonus chocolate — still preferred (it's a TV).
    expect(
      classifyFeedItemPreference(
        item("LG 65\" OLED TV + free chocolate gift", {
          categories: ["Electrical & Electronics"],
        })
      )
    ).toBe("preferred");
  });

  it("does NOT let a bare store rescue a non-preferred category", () => {
    // Alcohol from a tracked store is still alcohol → ignored.
    expect(
      classifyFeedItemPreference(
        item("The Lost Explorer Mezcal 700ml @ Costco (Membership Required)")
      )
    ).toBe("non_preferred");
  });

  it("classifies a tracked store with no negatives as preferred", () => {
    expect(
      classifyFeedItemPreference(item("Officeworks EOFY storewide event"))
    ).toBe("preferred");
  });

  it("does not false-match short tokens (car/pet word boundaries)", () => {
    // "card" must not match preferred "car"; with no other signal → uncertain.
    expect(classifyFeedItemPreference(item("Birthday card 10-pack"))).toBe(
      "uncertain"
    );
    // "carpet"/"petrol" must not match non-preferred "pet" → no false ignore.
    expect(
      classifyFeedItemPreference(item("Carpet stain remover bottle"))
    ).toBe("uncertain");
  });
});

describe("feedItemReviewState — staging decision", () => {
  it("stages a non-preferred item as 'ignored'", () => {
    expect(feedItemReviewState(item("Premium whisky mystery box"))).toBe(
      "ignored"
    );
  });

  it("stages a preferred item as 'new'", () => {
    expect(
      feedItemReviewState(item("Apple iPhone 16 case + earbuds"))
    ).toBe("new");
  });

  it("stages an uncertain item as 'new'", () => {
    expect(feedItemReviewState(item("Mystery box surprise deal"))).toBe("new");
  });
});
