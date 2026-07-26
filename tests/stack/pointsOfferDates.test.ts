import { describe, expect, it } from "vitest";
import type { PointsOffer } from "@/lib/offers/types";
import {
  isUpcomingSoonPointsOffer,
  orderCurrentReviewedPointsOffers,
  pointsOfferDateLabels,
  pointsOfferDateState,
  selectActivePointsOffers,
} from "@/lib/rewards/pointsOfferDates";

/**
 * Start-date policy for points offers (migration 042), under a CONTROLLED
 * clock — the AU-midnight boundary is the part that breaks silently, so every
 * case pins an explicit instant rather than trusting the ambient date.
 */

const points = (over: Partial<PointsOffer> = {}): PointsOffer =>
  ({
    id: "pts-1",
    merchantId: "coles",
    program: "Flybuys",
    earnRateDisplay: "20x points on Apple gift cards",
    earnMultiple: 20,
    pointValueCents: 0.5,
    mechanism: "in-store-boost",
    startsOn: null,
    expiryDate: null,
    citations: [{ source: "manual", sourceUrl: "/" }],
    confidence: "confirmed",
    lastCheckedAt: "2026-07-26T00:00:00+10:00",
    ...over,
  }) as PointsOffer;

/** 2026-07-26 12:00 Sydney — comfortably mid-day, no boundary effects. */
const NOW = new Date("2026-07-26T02:00:00Z");

describe("date state", () => {
  it("treats a null start as already running", () => {
    expect(pointsOfferDateState(points(), NOW)).toBe("active");
  });

  it("calls a later start date future and a passed expiry expired", () => {
    expect(
      pointsOfferDateState(points({ startsOn: "2026-07-29" }), NOW),
    ).toBe("future");
    expect(
      pointsOfferDateState(points({ expiryDate: "2026-07-25" }), NOW),
    ).toBe("expired");
  });

  it("is live on both its first and last day, not just between them", () => {
    expect(
      pointsOfferDateState(
        points({ startsOn: "2026-07-26", expiryDate: "2026-07-26" }),
        NOW,
      ),
    ).toBe("active");
  });

  it("lets expiry win over a start date — an expired row is never upcoming", () => {
    const offer = points({ startsOn: "2026-07-29", expiryDate: "2026-07-25" });
    expect(pointsOfferDateState(offer, NOW)).toBe("expired");
    expect(isUpcomingSoonPointsOffer(offer, NOW)).toBe(false);
  });
});

describe("the AU midnight boundary", () => {
  // 2026-07-28T13:30Z is 2026-07-28 23:30 in Sydney (AEST, +10) — still the
  // 28th locally. Thirty minutes later it is the 29th, and the offer starts.
  const beforeMidnight = new Date("2026-07-28T13:30:00Z");
  const afterMidnight = new Date("2026-07-28T14:30:00Z");
  const offer = points({ startsOn: "2026-07-29" });

  it("is still future at 23:30 Sydney on the eve", () => {
    expect(pointsOfferDateState(offer, beforeMidnight)).toBe("future");
  });

  it("is active from 00:30 Sydney on the day itself", () => {
    expect(pointsOfferDateState(offer, afterMidnight)).toBe("active");
  });
});

describe("the upcoming display window", () => {
  it("shows an offer starting inside the 7-day window", () => {
    expect(
      isUpcomingSoonPointsOffer(points({ startsOn: "2026-07-29" }), NOW),
    ).toBe(true);
  });

  it("includes the last day of the window and excludes the day after", () => {
    expect(
      isUpcomingSoonPointsOffer(points({ startsOn: "2026-08-02" }), NOW),
    ).toBe(true);
    expect(
      isUpcomingSoonPointsOffer(points({ startsOn: "2026-08-03" }), NOW),
    ).toBe(false);
  });

  it("never calls an already-running offer upcoming", () => {
    expect(isUpcomingSoonPointsOffer(points(), NOW)).toBe(false);
  });
});

describe("the active set the stack engine sees", () => {
  it("drops future and expired rows, keeps undated ones", () => {
    const pool = [
      points({ id: "running" }),
      points({ id: "soon", startsOn: "2026-07-29" }),
      points({ id: "far", startsOn: "2026-12-01" }),
      points({ id: "gone", expiryDate: "2026-07-25" }),
    ];
    expect(selectActivePointsOffers(pool, NOW).map((o) => o.id)).toEqual([
      "running",
    ]);
  });
});

describe("display ordering", () => {
  it("puts active offers first (ending soonest), then upcoming ones", () => {
    const pool = [
      points({ id: "upcoming-late", startsOn: "2026-08-01" }),
      points({ id: "no-end" }),
      points({ id: "ends-later", expiryDate: "2026-09-30" }),
      points({ id: "upcoming-soon", startsOn: "2026-07-29" }),
      points({ id: "ends-first", expiryDate: "2026-07-28" }),
    ];
    expect(orderCurrentReviewedPointsOffers(pool, NOW).map((o) => o.id)).toEqual(
      [
        "ends-first",
        "ends-later",
        "no-end",
        "upcoming-soon",
        "upcoming-late",
      ],
    );
  });

  it("hides a far-future offer from the display list entirely", () => {
    const pool = [points({ id: "far", startsOn: "2026-12-01" })];
    expect(orderCurrentReviewedPointsOffers(pool, NOW)).toEqual([]);
  });

  it("breaks ties on most recently checked, then id", () => {
    const pool = [
      points({ id: "b", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-20T00:00:00+10:00" }),
      points({ id: "a", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-20T00:00:00+10:00" }),
      points({ id: "c", expiryDate: "2026-08-01", lastCheckedAt: "2026-07-25T00:00:00+10:00" }),
    ];
    expect(orderCurrentReviewedPointsOffers(pool, NOW).map((o) => o.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("date labels", () => {
  it("shows a range when both dates are known", () => {
    expect(
      pointsOfferDateLabels(
        points({ startsOn: "2026-07-22", expiryDate: "2026-07-28" }),
        NOW,
      ),
    ).toEqual(["22 Jul 2026 to 28 Jul 2026"]);
  });

  it("shows only the end date when that is all the row carries", () => {
    expect(
      pointsOfferDateLabels(points({ expiryDate: "2026-07-28" }), NOW),
    ).toEqual(["Ends 28 Jul 2026"]);
  });

  it("leads a future offer with Starts, so it can never read as running", () => {
    expect(
      pointsOfferDateLabels(
        points({ startsOn: "2026-07-29", expiryDate: "2026-08-04" }),
        NOW,
      ),
    ).toEqual(["Starts 29 Jul 2026", "Ends 4 Aug 2026"]);
  });

  it("says the end date is not listed rather than claiming ongoing", () => {
    // points_offers has no reviewer-set ongoing flag, so "Ongoing" would
    // assert more than the row supports.
    expect(pointsOfferDateLabels(points(), NOW)).toEqual([
      "No end date listed",
    ]);
  });

  it("never renders an empty label set", () => {
    for (const offer of [
      points(),
      points({ startsOn: "2026-07-01" }),
      points({ expiryDate: "2026-08-01" }),
      points({ startsOn: "2026-07-29" }),
    ]) {
      expect(pointsOfferDateLabels(offer, NOW).length).toBeGreaterThan(0);
    }
  });
});
