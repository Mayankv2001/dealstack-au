import { describe, expect, it } from "vitest";
import {
  summarisePublishedDataHealth,
  type OfferTypeCounts,
} from "@/lib/admin/repos/dataHealth";

/**
 * The published-data health verdict. The expiry-integrity signal
 * (published/approved rows past their Sydney expiry day) is the direct detector
 * for a stale or failed archival job: the read boundary hides such rows, so only
 * a data-integrity count surfaces the silent failure.
 */

const ZERO: OfferTypeCounts = {
  cashback: 0,
  giftCards: 0,
  points: 0,
  signals: 0,
  weeklyDeals: 0,
  cardOffers: 0,
};

describe("summarisePublishedDataHealth", () => {
  it("is ok only when nothing is overdue AND nothing is expired-but-published", () => {
    const health = summarisePublishedDataHealth(ZERO, ZERO, "2026-07-21T00:00:00Z");
    expect(health.ok).toBe(true);
    expect(health.totalOverdue).toBe(0);
    expect(health.totalExpiredStillPublished).toBe(0);
  });

  it("alerts when an expired offer is still published even if every review is current", () => {
    const health = summarisePublishedDataHealth(
      ZERO,
      { ...ZERO, giftCards: 2, cashback: 1 },
      "2026-07-21T00:00:00Z",
    );
    expect(health.ok).toBe(false);
    expect(health.totalExpiredStillPublished).toBe(3);
    expect(health.totalOverdue).toBe(0);
    expect(health.expiredStillPublished.giftCards).toBe(2);
  });

  it("alerts on an overdue review even with no expired rows", () => {
    const health = summarisePublishedDataHealth(
      { ...ZERO, cardOffers: 1 },
      ZERO,
      "2026-07-21T00:00:00Z",
    );
    expect(health.ok).toBe(false);
    expect(health.totalOverdue).toBe(1);
    expect(health.totalExpiredStillPublished).toBe(0);
  });

  it("sums both maps independently across every offer type", () => {
    const overdue: OfferTypeCounts = {
      cashback: 1,
      giftCards: 2,
      points: 3,
      signals: 4,
      weeklyDeals: 5,
      cardOffers: 6,
    };
    const expired: OfferTypeCounts = {
      cashback: 6,
      giftCards: 5,
      points: 4,
      signals: 3,
      weeklyDeals: 2,
      cardOffers: 1,
    };
    const health = summarisePublishedDataHealth(overdue, expired, "now");
    expect(health.totalOverdue).toBe(21);
    expect(health.totalExpiredStillPublished).toBe(21);
    expect(health.ok).toBe(false);
    expect(health.checkedAt).toBe("now");
  });
});
