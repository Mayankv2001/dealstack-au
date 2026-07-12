import { describe, expect, it } from "vitest";
import {
  buildGiftCardOfferCardViewModel,
  splitBrandList,
} from "@/lib/giftcards/offerCardViewModel";
import { makeOffer, makeBareOffer, NOW } from "./offerFixture";

/**
 * The card view model is the guard between the raw offer rows (which include a
 * 500+ char, 33-brand comma list and many null dates) and the JSX. These tests
 * lock the production-data hazards shut.
 */

// The real production Amazon row: a 33-brand comma list, 10% off, ends 13 Jul.
const AMAZON_BRAND =
  "Amazon, Ultimate Active & Wellness, Ultimate Baby & Mum, Ultimate Beauty & Spa, " +
  "Ultimate Birthday, Ultimate Celebrate, Ultimate Eats, Ultimate Everyone, " +
  "Uber & Uber Eats, DoorDash, Apple, The Iconic, Fortnite, Roblox, Xbox, Razer Gold";

describe("splitBrandList", () => {
  it("splits on commas only — never on the ampersand inside a brand name", () => {
    expect(splitBrandList("Uber & Uber Eats, Harris Farm, Ultimate Active & Wellness"))
      .toEqual(["Uber & Uber Eats", "Harris Farm", "Ultimate Active & Wellness"]);
  });

  it("returns a single entry for a plain brand", () => {
    expect(splitBrandList("Coles Group")).toEqual(["Coles Group"]);
  });
});

describe("brand normalisation", () => {
  it("reduces a long comma list to a primary brand plus a '+N more' summary", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ brand: AMAZON_BRAND, purchaseLocation: "Amazon" }),
      NOW
    );
    expect(vm.brandPrimary).toBe("Amazon");
    expect(vm.brandSecondary).toBe("+15 more");
    expect(vm.brandCount).toBe(16);
  });

  it("never lets the raw brand list reach any rendered string", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ brand: AMAZON_BRAND, purchaseLocation: "Amazon" }),
      NOW
    );
    for (const value of [vm.headline, vm.brandPrimary, vm.brandSecondary ?? "", vm.valueBadge]) {
      expect(value).not.toContain(",");
      expect(value.length).toBeLessThanOrEqual(40);
    }
  });

  it("omits the '+N more' summary for a single-brand offer", () => {
    const vm = buildGiftCardOfferCardViewModel(makeOffer({ brand: "TCN" }), NOW);
    expect(vm.brandSecondary).toBeUndefined();
    expect(vm.brandCount).toBe(1);
  });
});

describe("date truthfulness", () => {
  it("reports a real expiry as a formatted end date", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ expiryDate: "2026-07-13" }),
      NOW
    );
    expect(vm.dateLabel).toBe("Ends 13 Jul 2026");
  });

  it("says 'No end date listed' — never 'Ongoing' — when the date is missing", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ expiryDate: null, startDate: null }),
      NOW
    );
    expect(vm.dateLabel).toBe("Dates not recorded — verify at source");
    expect(vm.dateLabel).not.toMatch(/ongoing/i);
  });

  it("adds an urgency label only when genuinely expiring soon", () => {
    const soon = buildGiftCardOfferCardViewModel(
      makeOffer({ expiryDate: "2026-07-15" }),
      NOW
    );
    expect(soon.urgencyLabel).toBe("Ends in 3 days");
    const far = buildGiftCardOfferCardViewModel(
      makeOffer({ expiryDate: "2026-09-30" }),
      NOW
    );
    expect(far.urgencyLabel).toBeUndefined();
  });

  it("shows Ongoing only for an explicit reviewed ongoing flag", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ expiryDate: null, startDate: null, isOngoing: true }),
      NOW
    );
    expect(vm.dateLabel).toBe("Ongoing");
  });

  it("labels a future promotion by its start and end dates", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ startDate: "2026-07-15", expiryDate: "2026-07-21" }),
      NOW
    );
    expect(vm.dateLabel).toBe("Starts 15 Jul 2026 · ends 21 Jul 2026");
  });
});

describe("mechanic classification", () => {
  it("classifies a plain discount", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ brand: "Amazon", discountPercent: 10, channel: "supermarket-promo" }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Discount");
    expect(vm.valueBadge).toBe("10% OFF");
    expect(vm.headline).toBe("10% off face value");
  });

  it("classifies a member-portal discount distinctly", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ brand: "Ultimate", discountPercent: 5, channel: "membership-portal" }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Member rate");
    expect(vm.valueBadge).toBe("5% MEMBER");
  });

  it("classifies a points multiplier offer", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({
        brand: "Apple",
        promotionType: "points",
        discountPercent: 0,
        pointsMultiplier: 20,
        pointsProgram: "Everyday Rewards",
        pointsOnPurchase: { program: "Everyday Rewards", earnNote: "20x" },
      }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Points");
    expect(vm.valueBadge).toBe("20× POINTS");
    expect(vm.headline).toBe("20× Everyday Rewards points");
    expect(vm.pointsDisclosure).toBe("Points are rewards, not cash.");
  });

  it("classifies a 0%-discount bonus-points row (the 'Sample:' data) as bonus points, not a discount", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({
        brand: "Coles Group",
        promotionType: "discount",
        discountPercent: 0,
        pointsOnPurchase: {
          program: "Flybuys",
          earnNote: "Sample: 2,000 bonus Flybuys when you buy $100+ in Coles Group gift cards",
        },
      }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Bonus points");
    expect(vm.valueBadge).toBe("BONUS POINTS");
    expect(vm.headline).toBe("Bonus Flybuys points");
    // The raw "Sample:" earn-note must never surface on the card.
    expect(vm.headline).not.toMatch(/sample/i);
    expect(vm.pointsDisclosure).toBe("Points are rewards, not cash.");
  });

  it("keeps promo credit separate from a checkout discount", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({
        promotionType: "promo-credit",
        discountPercent: 0,
        promoCreditDollars: 10,
        thresholdDollars: 100,
      }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Promo credit");
    expect(vm.valueBadge).toBe("$10 CREDIT");
    expect(vm.headline).toContain("future seller credit");
  });

  it("shows a fee waiver as a fee waiver", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({
        promotionType: "fee-waiver",
        discountPercent: 0,
        feeWaiverDollars: 4.95,
        thresholdDollars: 100,
      }),
      NOW
    );
    expect(vm.mechanicLabel).toBe("Fee waiver");
    expect(vm.headline).toBe("Purchase fee waived");
  });
});

describe("seller / source separation", () => {
  it("keeps seller and a distinct source separate", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({ purchaseLocation: "Amazon", source: "GCDB", sourceName: "Gift Card Database" }),
      NOW
    );
    expect(vm.sellerLabel).toBe("Amazon");
    expect(vm.sourceLabel).toBe("Gift Card Database");
  });

  it("suppresses a redundant source that just repeats the seller", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeOffer({
        purchaseLocation: "NRMA Blue member portal",
        source: "NRMA Blue",
        sourceName: null,
      }),
      NOW
    );
    expect(vm.sellerLabel).toBe("NRMA Blue member portal");
    expect(vm.sourceLabel).toBeUndefined();
  });
});

describe("trust and compatibility", () => {
  it("maps a confirmed offer to a positive, verified card", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeBareOffer({
        confidence: "confirmed",
        expiryDate: "2026-09-30",
        acceptedAtMerchantIds: ["jb-hifi"],
      }),
      NOW
    );
    expect(vm.trustLabel).toBe("Verified by DealStack");
    expect(vm.compatibilityTone).toBe("positive");
  });

  it("defaults an imported offer with no acceptance evidence to Verify stacking", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeBareOffer({ confidence: "confirmed", expiryDate: "2026-09-30" }),
      NOW
    );
    expect(vm.compatibilityLabel).toBe("Verify stacking");
    expect(vm.compatibilityTone).toBe("warning");
  });

  it("maps a needs-verification offer to a warning tone with a source-checked trust label", () => {
    const vm = buildGiftCardOfferCardViewModel(
      makeBareOffer({ confidence: "needs-verification", expiryDate: "2026-09-30" }),
      NOW
    );
    expect(vm.trustLabel).toBe("Source checked");
    expect(vm.compatibilityLabel).toBe("Verify stacking");
    expect(vm.compatibilityTone).toBe("warning");
  });
});

describe("links", () => {
  it("always links to the detail page and only offers a stack link when a store is known", () => {
    const withStore = buildGiftCardOfferCardViewModel(
      makeOffer({ id: "gc-x", acceptedAtMerchantIds: ["jb-hifi"] }),
      NOW
    );
    expect(withStore.detailHref).toBe("/gift-cards/gc-x");
    expect(withStore.buildStackHref).toBe("/?stack=jb-hifi#calculator");

    const withoutStore = buildGiftCardOfferCardViewModel(
      makeOffer({ acceptedAtMerchantIds: [] }),
      NOW
    );
    expect(withoutStore.buildStackHref).toBeUndefined();
  });
});
