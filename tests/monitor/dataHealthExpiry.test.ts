import { describe, expect, it } from "vitest";
import {
  expiryIntegrityBoundary,
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

describe("expiryIntegrityBoundary", () => {
  // Offers expire at Sydney midnight; the cleanup cron fires at 10:00 Sydney.
  // The integrity alert must not fire inside that same-day window, only once a
  // cleanup slot has verifiably been missed (2026-07-25 incident).
  it("is the previous Sydney day just after Sydney midnight (AEST)", () => {
    // 2026-07-24T14:16Z = 00:16 on the 25th in Sydney — the incident probe.
    expect(expiryIntegrityBoundary(new Date("2026-07-24T14:16:00Z"))).toBe(
      "2026-07-24",
    );
    // An offer whose expiry_date is 2026-07-24 is NOT before the boundary, so
    // the pre-cleanup window stays green; from the 26th Sydney it alerts.
    expect(expiryIntegrityBoundary(new Date("2026-07-25T14:16:00Z"))).toBe(
      "2026-07-25",
    );
  });

  it("tracks the Sydney calendar across the UTC date line during AEDT", () => {
    // 2026-01-10T14:00Z = 01:00 on the 11th in Sydney (UTC+11).
    expect(expiryIntegrityBoundary(new Date("2026-01-10T14:00:00Z"))).toBe(
      "2026-01-10",
    );
  });

  it("stays on the prior day right before Sydney midnight", () => {
    // 2026-07-24T13:59Z = 23:59 on the 24th in Sydney.
    expect(expiryIntegrityBoundary(new Date("2026-07-24T13:59:00Z"))).toBe(
      "2026-07-23",
    );
  });
});

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
