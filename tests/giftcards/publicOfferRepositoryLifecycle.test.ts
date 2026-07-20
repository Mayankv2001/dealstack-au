import { describe, expect, it } from "vitest";
import {
  getCurrentReviewedGiftCardOffers,
  getGiftCardOffers,
} from "@/lib/repos/offers";
import type { DbClient } from "@/lib/supabase/server";

const NOW = new Date("2026-07-15T02:00:00Z");

function row(
  id: string,
  startDate: string | null,
  expiryDate: string | null,
  ongoing = false,
) {
  return {
    id,
    brand: "Test card",
    discount_percent: 10,
    channel: "supermarket-promo",
    source: "Reviewed source",
    accepted_at_merchant_ids: [],
    points_on_purchase: null,
    cap_dollars: null,
    expiry_date: expiryDate,
    start_date: startDate,
    purchase_location: "Test seller",
    purchase_method: "online",
    limit_per_customer: null,
    accepted_at: [],
    usage_notes: [],
    stack_notes: [],
    source_detail_url: "https://example.com/offer",
    promotion_type: "discount",
    bonus_percent: null,
    points_multiplier: null,
    fixed_points: null,
    points_program: null,
    points_value_cents: null,
    fixed_discount_dollars: null,
    promo_credit_dollars: null,
    fee_waiver_dollars: null,
    threshold_dollars: null,
    reward_destination: "checkout-discount",
    is_ongoing: ongoing,
    targeted: false,
    source_suboffer_key: "primary",
    membership_required: false,
    activation_required: false,
    coupon_required: false,
    min_spend: null,
    denomination_note: null,
    format: "digital",
    source_name: "Reviewed source",
    product_id: null,
    source_last_seen_at: NOW.toISOString(),
    promo_code: null,
    expiry_time: null,
    expiry_timezone: null,
    uses_per_customer: null,
    shipping_may_apply: false,
    australia_only: true,
    combinable_with_seller_promotions: null,
    terms_url: null,
    included_product_ids: [],
    citations: [],
    confidence: "confirmed",
    last_checked_at: NOW.toISOString(),
  };
}

function client(rows: unknown[]): DbClient {
  return {
    from: () => ({
      select: async () => ({ data: rows, error: null }),
    }),
  } as unknown as DbClient;
}

describe("getGiftCardOffers lifecycle boundary", () => {
  it("keeps every direct public consumer on current/ongoing offers only", async () => {
    const offers = await getGiftCardOffers({
      staticMode: false,
      client: client([
        row("current", "2026-07-01", "2026-07-20"),
        row("future", "2026-07-16", "2026-07-20"),
        row("expired", "2026-07-01", "2026-07-14"),
        row("unknown", "2026-07-01", null),
        row("ongoing", null, null, true),
      ]),
      now: NOW,
    });
    expect(offers.map((offer) => offer.id)).toEqual(["current", "ongoing"]);
  });

  it("does not resurrect demo offers when a configured DB returns no rows", async () => {
    expect(
      await getGiftCardOffers({
        staticMode: false,
        client: client([]),
        now: NOW,
      }),
    ).toEqual([]);
  });
});

describe("getCurrentReviewedGiftCardOffers display boundary", () => {
  it("surfaces unknown-expiry offers (ranked last) and labelled upcoming-soon offers behind them", async () => {
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client([
        row("soon", "2026-07-01", "2026-07-16"),
        row("later", "2026-07-01", "2026-09-30"),
        // Starts tomorrow: inside the 7-day upcoming window → shown LAST.
        row("upcoming", "2026-07-16", "2026-07-20"),
        // Starts beyond the window → hidden entirely.
        row("far-future", "2026-08-30", "2026-09-06"),
        row("expired", "2026-07-01", "2026-07-14"),
        row("unknown", null, null),
        row("ongoing", null, null, true),
      ]),
      now: NOW,
    });
    // Active dated first (soonest → latest), then undated, then upcoming.
    expect(offers.slice(0, 2).map((o) => o.id)).toEqual(["soon", "later"]);
    expect(offers.at(-1)!.id).toBe("upcoming");
    expect(offers.map((o) => o.id).sort()).toEqual([
      "later",
      "ongoing",
      "soon",
      "unknown",
      "upcoming",
    ]);
    expect(offers.map((o) => o.id)).not.toContain("expired");
    expect(offers.map((o) => o.id)).not.toContain("far-future");
  });

  it("applies the limit after ordering", async () => {
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client([
        row("later", "2026-07-01", "2026-09-30"),
        row("soon", "2026-07-01", "2026-07-16"),
        row("unknown", null, null),
      ]),
      now: NOW,
      limit: 2,
    });
    expect(offers.map((o) => o.id)).toEqual(["soon", "later"]);
  });
});

describe("public value-readiness boundary (both read paths)", () => {
  it("drops published rows without promotion-specific value data — the detail route then 404s", async () => {
    const corrupted = {
      ...row("gc-corrupted", "2026-07-01", "2026-09-30"),
      // The Coles Group corruption shape: a 0% "discount" whose only value
      // lives in prose. It was published before the rule existed.
      discount_percent: 0,
      promotion_type: null,
      points_on_purchase: {
        program: "Flybuys",
        earnNote: "Bonus points described only in prose",
      },
    };
    const contradictory = {
      ...row("gc-contradictory", "2026-07-01", "2026-09-30"),
      discount_percent: 0,
      promotion_type: "points",
      points_multiplier: 10,
      fixed_points: 1000,
      points_program: "Flybuys",
    };
    const healthy = row("gc-healthy", "2026-07-01", "2026-09-30");
    const fixedPoints = {
      ...row("gc-fixed-points", "2026-07-01", "2026-08-30"),
      discount_percent: 0,
      promotion_type: "points",
      fixed_points: 1000,
      points_program: "Flybuys",
      reward_destination: "loyalty-points",
    };

    const display = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client([corrupted, contradictory, healthy, fixedPoints]),
      now: NOW,
    });
    expect(display.map((o) => o.id).sort()).toEqual([
      "gc-fixed-points",
      "gc-healthy",
    ]);

    const engine = await getGiftCardOffers({
      staticMode: false,
      client: client([corrupted, contradictory, healthy, fixedPoints]),
      now: NOW,
    });
    expect(engine.map((o) => o.id)).not.toContain("gc-corrupted");
    expect(engine.map((o) => o.id)).not.toContain("gc-contradictory");
  });

  it("keeps a fixed-points offer public even without a disclosed valuation", async () => {
    const obscureProgramme = {
      ...row("gc-obscure", "2026-07-01", "2026-08-30"),
      discount_percent: 0,
      promotion_type: "points",
      fixed_points: 500,
      points_program: "Mystery Rewards",
      reward_destination: "loyalty-points",
    };
    const display = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client([obscureProgramme]),
      now: NOW,
    });
    expect(display.map((o) => o.id)).toEqual(["gc-obscure"]);
  });
});
