import { describe, expect, it } from "vitest";
import {
  filterConfirmedCurrentOffers,
  planLifecycle,
  isConfirmedCurrent,
  type LifecycleOffer,
} from "@/lib/giftcards/lifecycle";

// Fixed Sydney-afternoon clock: 2026-07-15 (AEST). todayAU → "2026-07-15".
const NOW = new Date("2026-07-15T02:00:00Z"); // 12:00 AEST

const offer = (o: Partial<LifecycleOffer> & { id: string; isActive: boolean }): LifecycleOffer => ({
  startDate: null,
  expiryDate: null,
  isOngoing: false,
  ...o,
});

describe("planLifecycle", () => {
  it("activates an approved-but-inactive offer exactly on its Sydney start date", () => {
    const plan = planLifecycle(
      [offer({ id: "a", startDate: "2026-07-15", expiryDate: "2026-07-20", isActive: false })],
      NOW
    );
    expect(plan.toActivate).toEqual(["a"]);
    expect(plan.toArchive).toEqual([]);
    expect(plan.upcoming).toEqual([]);
  });

  it("does not activate a still-upcoming offer, and lists it as upcoming", () => {
    const plan = planLifecycle(
      [offer({ id: "b", startDate: "2026-07-16", expiryDate: "2026-07-20", isActive: false })],
      NOW
    );
    expect(plan.toActivate).toEqual([]);
    expect(plan.upcoming).toEqual(["b"]);
  });

  it("archives an active offer only after its confirmed end date has passed", () => {
    const plan = planLifecycle(
      [
        offer({ id: "ended", startDate: "2026-07-01", expiryDate: "2026-07-14", isActive: true }),
        offer({ id: "ends-today", startDate: "2026-07-01", expiryDate: "2026-07-15", isActive: true }),
      ],
      NOW
    );
    // ends-today is still valid on its expiry date (date-level, conservative).
    expect(plan.toArchive).toEqual(["ended"]);
  });

  it("never archives an ongoing offer, and activates it when inactive", () => {
    const plan = planLifecycle(
      [
        offer({ id: "ong-active", isOngoing: true, isActive: true }),
        offer({ id: "ong-inactive", isOngoing: true, isActive: false }),
      ],
      NOW
    );
    expect(plan.toArchive).toEqual([]);
    expect(plan.toActivate).toEqual(["ong-inactive"]);
  });

  it("treats a no-date, non-ongoing offer as unknown (not active, not archived)", () => {
    const plan = planLifecycle([offer({ id: "u", isActive: false })], NOW);
    expect(plan.unknownDate).toEqual(["u"]);
    expect(plan.toActivate).toEqual([]);
    expect(plan.toArchive).toEqual([]);
  });

  it("keeps a started offer with missing expiry unknown unless explicitly ongoing", () => {
    const plan = planLifecycle(
      [offer({ id: "missing-end", startDate: "2026-07-01", isActive: true })],
      NOW,
    );
    expect(plan.unknownDate).toEqual(["missing-end"]);
    expect(plan.toActivate).toEqual([]);
    expect(plan.toArchive).toEqual([]);
  });

  it("is idempotent: re-running with the applied state yields empty activate/archive", () => {
    const offers = [
      offer({ id: "a", startDate: "2026-07-15", expiryDate: "2026-07-20", isActive: false }),
      offer({ id: "e", startDate: "2026-07-01", expiryDate: "2026-07-14", isActive: true }),
    ];
    const first = planLifecycle(offers, NOW);
    expect(first.toActivate).toEqual(["a"]);
    expect(first.toArchive).toEqual(["e"]);
    // Apply the decisions: a becomes active, e leaves active surfaces.
    const applied = [
      offer({ id: "a", startDate: "2026-07-15", expiryDate: "2026-07-20", isActive: true }),
      offer({ id: "e", startDate: "2026-07-01", expiryDate: "2026-07-14", isActive: false }),
    ];
    const second = planLifecycle(applied, NOW);
    expect(second.toActivate).toEqual([]);
    expect(second.toArchive).toEqual([]);
  });

  it("derives the boundary on the Sydney calendar date, not UTC", () => {
    // 2026-07-15T21:30Z = 2026-07-16 07:30 AEST → Sydney date is the 16th.
    const lateUtc = new Date("2026-07-15T21:30:00Z");
    const plan = planLifecycle(
      [offer({ id: "s", startDate: "2026-07-16", expiryDate: "2026-07-20", isActive: false })],
      lateUtc
    );
    // On the Sydney 16th the offer's window is open → activate (UTC would still read the 15th).
    expect(plan.toActivate).toEqual(["s"]);
    expect(plan.upcoming).toEqual([]);
  });
});

describe("isConfirmedCurrent", () => {
  it("is true only for active/ongoing rows, false for upcoming/unknown/expired", () => {
    expect(isConfirmedCurrent(offer({ id: "1", expiryDate: "2026-07-20", isActive: true }), NOW)).toBe(true);
    expect(isConfirmedCurrent(offer({ id: "2", isOngoing: true, isActive: true }), NOW)).toBe(true);
    expect(isConfirmedCurrent(offer({ id: "3", startDate: "2026-07-20", isActive: false }), NOW)).toBe(false);
    expect(isConfirmedCurrent(offer({ id: "4", isActive: false }), NOW)).toBe(false);
    expect(isConfirmedCurrent(offer({ id: "5", expiryDate: "2026-07-10", isActive: true }), NOW)).toBe(false);
  });
});

describe("filterConfirmedCurrentOffers", () => {
  it("is the shared public boundary for future, expired and unknown dates", () => {
    const rows = [
      { id: "current", startDate: "2026-07-01", expiryDate: "2026-07-20" },
      { id: "future", startDate: "2026-07-16", expiryDate: "2026-07-20" },
      { id: "expired", startDate: "2026-07-01", expiryDate: "2026-07-14" },
      { id: "unknown", startDate: "2026-07-01", expiryDate: null },
      { id: "ongoing", startDate: null, expiryDate: null, isOngoing: true },
    ];
    expect(filterConfirmedCurrentOffers(rows, NOW).map((row) => row.id)).toEqual([
      "current",
      "ongoing",
    ]);
  });
});
