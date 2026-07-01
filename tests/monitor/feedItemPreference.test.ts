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

describe("classifyFeedItemPreference — rewards/loyalty signals override weak negatives", () => {
  it("rescues an AmEx Qantas points card despite 'Travel Fund' wording", () => {
    expect(
      classifyFeedItemPreference(
        item(
          "American Express Qantas Business Card - up to 190,000 bonus Qantas Points",
          {
            raw_summary:
              "Plus a $500 Travel Fund credit each cardmember year. T&Cs apply.",
          }
        )
      )
    ).toBe("preferred");
  });

  it("classifies a Velocity transfer bonus as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Velocity Frequent Flyer: 30% transfer bonus from Amex points")
      )
    ).toBe("preferred");
  });

  it("classifies a Flybuys / Everyday Rewards points deal as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("Flybuys members: earn 10,000 bonus points at Coles this week")
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("Everyday Rewards bonus points event this weekend")
      )
    ).toBe("preferred");
  });

  it("classifies cashback dining wording as preferred when the deal is cashback", () => {
    expect(
      classifyFeedItemPreference(
        item("15% cashback at participating restaurants this weekend")
      )
    ).toBe("preferred");
  });

  it("keeps a plain airfare/travel deal with no rewards signal as non_preferred", () => {
    expect(
      classifyFeedItemPreference(item("Cheap airfares to Bali this July + hotel"))
    ).toBe("non_preferred");
  });

  it("keeps alcohol with no rewards signal as non_preferred", () => {
    expect(
      classifyFeedItemPreference(item("Ballantine's whisky 700ml $45"))
    ).toBe("non_preferred");
  });

  it("keeps a gaming pre-order as non_preferred (rewards wording does not rescue it)", () => {
    expect(
      classifyFeedItemPreference(
        item("[Pre Order, PS5] Grand Theft Auto VI (Download Code in Box)")
      )
    ).toBe("non_preferred");
  });
});

describe("classifyFeedItemPreference — broader source expansion categories", () => {
  it("classifies a credit card sign-up bonus as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item(
          "NAB Rewards Signature Credit Card: 100,000 bonus points sign-up bonus",
          { raw_summary: "$3,000 minimum spend in 90 days. $295 annual fee." }
        )
      )
    ).toBe("preferred");
  });

  it("classifies a named bank offer (CommBank/ANZ/Westpac) as preferred", () => {
    expect(
      classifyFeedItemPreference(item("CommBank Yello: exclusive member deal"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("ANZ: exclusive card member offer at David Jones this month")
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("[Westpac, StG, BoM, BSA] 50% Apple Pay Bonus Statement Credit")
      )
    ).toBe("preferred");
  });

  it("classifies a ShopBack / TopCashback offer as preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("ShopBack: 20% Boost on Booking.com Hotels This Weekend Only")
      )
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("TopCashback: 100% New Customer Bonus on Travel Bookings")
      )
    ).toBe("preferred");
  });

  it("classifies an Uber Eats / DoorDash offer as preferred", () => {
    expect(
      classifyFeedItemPreference(item("$10 Ding Dong Deals - Uber Eats"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(
        item("DoorDash: 25% off your first 3 orders, min spend $15")
      )
    ).toBe("preferred");
  });

  it("classifies a generic grocery deal as preferred", () => {
    expect(
      classifyFeedItemPreference(item("Weekly grocery specials: half price cereal"))
    ).toBe("preferred");
  });

  it("keeps a plain restaurant dining offer with no rewards/platform signal as non_preferred", () => {
    expect(
      classifyFeedItemPreference(
        item("20% off dining at participating restaurants this weekend")
      )
    ).toBe("non_preferred");
  });

  it("still keeps electronics/fashion/beauty/automotive/household preferred", () => {
    expect(
      classifyFeedItemPreference(item("Samsung 55\" 4K TV $699 delivered"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Nike running shoes 40% off"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Dior Sauvage fragrance 100ml"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Bridgestone tyres 4-pack deal"))
    ).toBe("preferred");
    expect(
      classifyFeedItemPreference(item("Dyson vacuum cleaner $399"))
    ).toBe("preferred");
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
