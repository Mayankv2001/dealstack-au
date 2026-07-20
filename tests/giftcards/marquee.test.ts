import { describe, expect, it } from "vitest";
import { buildMarquee } from "@/lib/giftcards/marquee";
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

  it("never truncates: every displayable offer becomes a slide", () => {
    const total = 20;
    const offers = Array.from({ length: total }, (_, i) =>
      makeOffer({
        id: `gc-${String(i).padStart(2, "0")}`,
        // Distinct, valid far-future expiries so none are dropped as expired.
        expiryDate: `2027-01-${String((i % 28) + 1).padStart(2, "0")}`,
      }),
    );
    const { slides, liveCount } = buildMarquee(offers, NOW);
    expect(slides).toHaveLength(total);
    expect(liveCount).toBe(total);
  });

  it("keeps a deterministic order so desktop page 3 is exactly offers 7–9", () => {
    // 9 offers with staggered expiries, supplied shuffled. Desktop shows 3 per
    // page; the third page must be positions 7–9 of the ending-soonest order.
    const offers = [5, 2, 8, 0, 6, 3, 7, 1, 4].map((i) =>
      makeOffer({
        id: `gc-slide-${i}`,
        expiryDate: `2026-08-${String(10 + i).padStart(2, "0")}`,
      }),
    );
    const { slides } = buildMarquee(offers, NOW);
    const ids = slides.map((slide) => slide.id);
    expect(ids).toEqual(Array.from({ length: 9 }, (_, i) => `gc-slide-${i}`));
    expect(ids.slice(6, 9)).toEqual(["gc-slide-6", "gc-slide-7", "gc-slide-8"]);
    // Rebuilding from a different input order changes nothing.
    const again = buildMarquee(offers.slice().reverse(), NOW);
    expect(again.slides.map((slide) => slide.id)).toEqual(ids);
  });

  it("appends upcoming-soon offers after active ones, labelled and non-urgent", () => {
    const { slides, liveCount } = buildMarquee(
      [
        makeOffer({
          id: "gc-upcoming",
          // NOW is 12 Jul 2026: starts within the 7-day window.
          startDate: "2026-07-15",
          expiryDate: "2026-07-21",
        }),
        makeOffer({ id: "gc-active", expiryDate: "2026-07-17" }),
        makeOffer({
          id: "gc-far-future",
          startDate: "2026-09-01",
          expiryDate: "2026-09-07",
        }),
      ],
      NOW,
    );
    expect(slides.map((slide) => slide.id)).toEqual([
      "gc-active",
      "gc-upcoming",
    ]);
    expect(liveCount).toBe(2);
    const upcoming = slides[1];
    expect(upcoming.dateLabel).toBe("Starts 15 Jul 2026 · ends 21 Jul 2026");
    // Never described as currently active: no urgency chip, explicit caveat.
    expect(upcoming.urgencyLabel).toBeUndefined();
    expect(upcoming.caveat).toMatch(/not active yet/i);
  });

  it("gives every slide a working detail link for its own offer id", () => {
    const offers = [
      makeOffer({ id: "gc-a", expiryDate: "2026-07-17" }),
      makeOffer({ id: "gc-b", expiryDate: "2026-07-18" }),
    ];
    const { slides } = buildMarquee(offers, NOW);
    expect(slides.map((slide) => slide.detailHref)).toEqual([
      "/gift-cards/gc-a",
      "/gift-cards/gc-b",
    ]);
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
