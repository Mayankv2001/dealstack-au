import { describe, expect, it } from "vitest";
import {
  MARQUEE_SLIDE_CAP,
  buildMarquee,
} from "@/lib/giftcards/marquee";
import { makeBareOffer, makeOffer, NOW } from "./offerFixture";

describe("buildMarquee", () => {
  it("drops expired offers and counts only live ones", () => {
    const { slides, liveCount } = buildMarquee(
      [
        makeOffer({ id: "gc-live", expiryDate: "2026-07-17" }),
        makeOffer({ id: "gc-expired", expiryDate: "2026-07-10" }),
      ],
      NOW,
    );
    expect(slides.map((slide) => slide.id)).toEqual(["gc-live"]);
    expect(liveCount).toBe(1);
  });

  it("orders soonest expiry first with no-expiry offers last", () => {
    const { slides } = buildMarquee(
      [
        makeBareOffer({ id: "gc-evergreen", expiryDate: null }),
        makeOffer({ id: "gc-later", expiryDate: "2026-09-30" }),
        makeOffer({ id: "gc-tomorrow", expiryDate: "2026-07-13" }),
      ],
      NOW,
    );
    expect(slides.map((slide) => slide.id)).toEqual([
      "gc-tomorrow",
      "gc-later",
      "gc-evergreen",
    ]);
  });

  it("caps the slideshow while still reporting the full live count", () => {
    const offers = Array.from({ length: MARQUEE_SLIDE_CAP + 2 }, (_, i) =>
      makeOffer({ id: `gc-${i}`, expiryDate: `2026-08-0${i + 1}` }),
    );
    const { slides, liveCount } = buildMarquee(offers, NOW);
    expect(slides).toHaveLength(MARQUEE_SLIDE_CAP);
    expect(liveCount).toBe(MARQUEE_SLIDE_CAP + 2);
  });

  it("works the $100 discount example as cash, matching the detail page", () => {
    const { slides } = buildMarquee([makeOffer({ discountPercent: 10 })], NOW);
    expect(slides[0].isRewardOnly).toBe(false);
    expect(slides[0].example).toMatchObject({
      faceValue: 100,
      cashPaid: 90,
      saving: 10,
    });
  });

  it("never presents a points offer as a cash discount", () => {
    const { slides } = buildMarquee(
      [
        makeOffer({
          id: "gc-points",
          discountPercent: 0,
          promotionType: "points",
          pointsMultiplier: 20,
          pointsProgram: "Everyday Rewards",
          channel: "supermarket-promo",
        }),
      ],
      NOW,
    );
    const [slide] = slides;
    expect(slide.isRewardOnly).toBe(true);
    // Cash is untouched; the points and their disclosed estimate stay separate.
    expect(slide.example).toMatchObject({
      cashPaid: 100,
      saving: 0,
      points: 2000,
      rewardValueDollars: 10,
      pointValueCents: 0.5,
    });
    expect(slide.caveat).toMatch(/not cash/i);
  });

  it("shows no reward estimate when no valuation is disclosed", () => {
    const { slides } = buildMarquee(
      [
        makeOffer({
          id: "gc-unknown-programme",
          discountPercent: 0,
          promotionType: "points",
          pointsMultiplier: 20,
          pointsProgram: "Mystery Rewards",
        }),
      ],
      NOW,
    );
    // buildWorkedExample returns null (nothing quantifiable) — never guess.
    expect(slides[0].example).toBeNull();
    expect(slides[0].isRewardOnly).toBe(true);
  });

  it("prioritises the membership caveat over the generic cashback warning", () => {
    const { slides } = buildMarquee(
      [makeBareOffer({ channel: "membership-portal", expiryDate: "2026-07-15" })],
      NOW,
    );
    expect(slides[0].caveat).toMatch(/membership/i);
  });
});
