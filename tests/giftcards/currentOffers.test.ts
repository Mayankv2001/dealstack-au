import { describe, expect, it } from "vitest";
import {
  compareCurrentGiftCardOffers,
  isUpcomingSoonGiftCardOffer,
  orderCurrentReviewedGiftCardOffers,
  selectCurrentGiftCardOffers,
} from "@/lib/giftcards/currentOffers";
import { makeOffer, NOW } from "./offerFixture";

describe("selectCurrentGiftCardOffers", () => {
  it("keeps live and unknown-expiry offers, drops expired and future", () => {
    const offers = [
      makeOffer({ id: "live", startDate: "2026-07-01", expiryDate: "2026-07-20" }),
      makeOffer({ id: "unknown", startDate: null, expiryDate: null }),
      makeOffer({ id: "ongoing", startDate: null, expiryDate: null, isOngoing: true }),
      makeOffer({ id: "expired", startDate: "2026-07-01", expiryDate: "2026-07-10" }),
      makeOffer({ id: "future", startDate: "2026-07-20", expiryDate: "2026-08-20" }),
    ];
    const ids = selectCurrentGiftCardOffers(offers, NOW).map((o) => o.id).sort();
    expect(ids).toEqual(["live", "ongoing", "unknown"]);
  });
});

describe("compareCurrentGiftCardOffers ordering", () => {
  it("ends soonest first, unknown expiry last", () => {
    const offers = [
      makeOffer({ id: "unknown", expiryDate: null }),
      makeOffer({ id: "later", expiryDate: "2026-09-30" }),
      makeOffer({ id: "soon", expiryDate: "2026-07-15" }),
    ];
    expect(offers.slice().sort(compareCurrentGiftCardOffers).map((o) => o.id)).toEqual([
      "soon",
      "later",
      "unknown",
    ]);
  });

  it("breaks ties on same expiry by most-recently-checked, then id", () => {
    const offers = [
      makeOffer({ id: "b", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-01T00:00:00Z" }),
      makeOffer({ id: "a", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-01T00:00:00Z" }),
      makeOffer({ id: "c", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-10T00:00:00Z" }),
    ];
    expect(offers.slice().sort(compareCurrentGiftCardOffers).map((o) => o.id)).toEqual([
      "c", // newest check wins
      "a", // then id ascending
      "b",
    ]);
  });

  it("orders two unknown-expiry offers deterministically by checked then id", () => {
    const offers = [
      makeOffer({ id: "z", expiryDate: null, lastCheckedAt: "2026-07-01T00:00:00Z" }),
      makeOffer({ id: "y", expiryDate: null, lastCheckedAt: "2026-07-05T00:00:00Z" }),
    ];
    expect(orderCurrentReviewedGiftCardOffers(offers, NOW).map((o) => o.id)).toEqual([
      "y",
      "z",
    ]);
  });
});

describe("upcoming tier (orderCurrentReviewedGiftCardOffers)", () => {
  it("appends upcoming-soon offers after every active offer, starting soonest first", () => {
    const ordered = orderCurrentReviewedGiftCardOffers(
      [
        makeOffer({ id: "gc-up-later", startDate: "2026-07-16", expiryDate: "2026-07-30" }),
        makeOffer({ id: "gc-active-late", expiryDate: "2026-09-30" }),
        makeOffer({ id: "gc-up-sooner", startDate: "2026-07-14", expiryDate: "2026-07-29" }),
        makeOffer({ id: "gc-active-soon", expiryDate: "2026-07-15" }),
      ],
      NOW,
    );
    expect(ordered.map((offer) => offer.id)).toEqual([
      "gc-active-soon",
      "gc-active-late",
      "gc-up-sooner",
      "gc-up-later",
    ]);
  });

  it("hides offers starting beyond the display window", () => {
    expect(
      isUpcomingSoonGiftCardOffer(
        makeOffer({ startDate: "2026-07-19", expiryDate: "2026-07-25" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isUpcomingSoonGiftCardOffer(
        makeOffer({ startDate: "2026-07-20", expiryDate: "2026-07-25" }),
        NOW,
      ),
    ).toBe(false);
  });

  it("never lets an expired offer in through either tier", () => {
    const ordered = orderCurrentReviewedGiftCardOffers(
      [makeOffer({ id: "gc-dead", startDate: "2026-07-01", expiryDate: "2026-07-10" })],
      NOW,
    );
    expect(ordered).toEqual([]);
  });
});
