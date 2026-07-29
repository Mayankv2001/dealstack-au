import { describe, expect, it } from "vitest";
import { endingSoonDeals, latestReviewedDeals } from "@/lib/deals/highlights";
import type { PublicDeal } from "@/lib/deals/types";

/** Front-page highlight selections, under a controlled clock. */

const NOW = new Date("2026-07-26T02:00:00Z"); // 26 Jul mid-day Sydney

const deal = (over: Partial<PublicDeal>): PublicDeal =>
  ({
    id: "gift-card:x",
    kind: "gift-card",
    title: "Offer",
    dateStatus: "confirmed-current",
    expiryDate: null,
    lastCheckedAt: "2026-07-25T00:00:00Z",
    ...over,
  }) as PublicDeal;

describe("endingSoonDeals", () => {
  it("keeps only offers ending within the week, soonest first", () => {
    const picked = endingSoonDeals(
      [
        deal({ id: "a", expiryDate: "2026-08-20" }), // beyond the window
        deal({ id: "b", expiryDate: "2026-07-28" }),
        deal({ id: "c", expiryDate: "2026-07-27" }),
        deal({ id: "d", expiryDate: null }), // no end date
        deal({ id: "e", expiryDate: "2026-07-27", dateStatus: "expired" }),
      ],
      NOW,
    );
    expect(picked.map((d) => d.id)).toEqual(["c", "b"]);
  });

  it("caps at the limit", () => {
    const pool = ["27", "28", "29", "30"].map((d) =>
      deal({ id: d, expiryDate: `2026-07-${d}` }),
    );
    expect(endingSoonDeals(pool, NOW, 3)).toHaveLength(3);
  });
});

describe("latestReviewedDeals", () => {
  it("orders by most recent check, drops expired and unchecked rows", () => {
    const picked = latestReviewedDeals([
      deal({ id: "old", lastCheckedAt: "2026-07-01T00:00:00Z" }),
      deal({ id: "new", lastCheckedAt: "2026-07-25T00:00:00Z" }),
      deal({ id: "gone", lastCheckedAt: "2026-07-26T00:00:00Z", dateStatus: "expired" }),
      deal({ id: "never", lastCheckedAt: null }),
    ]);
    expect(picked.map((d) => d.id)).toEqual(["new", "old"]);
  });

  it("breaks timestamp ties on id for a stable order", () => {
    const picked = latestReviewedDeals([
      deal({ id: "b" }),
      deal({ id: "a" }),
    ]);
    expect(picked.map((d) => d.id)).toEqual(["a", "b"]);
  });
});
