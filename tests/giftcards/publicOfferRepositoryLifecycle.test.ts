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
  it("surfaces unknown-expiry offers (ranked last), dropping only expired/future", async () => {
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client([
        row("soon", "2026-07-01", "2026-07-16"),
        row("later", "2026-07-01", "2026-09-30"),
        row("future", "2026-07-16", "2026-07-20"),
        row("expired", "2026-07-01", "2026-07-14"),
        row("unknown", null, null),
        row("ongoing", null, null, true),
      ]),
      now: NOW,
    });
    // Dated offers first (soonest → latest), then the undated ones behind them.
    expect(offers.slice(0, 2).map((o) => o.id)).toEqual(["soon", "later"]);
    expect(offers.map((o) => o.id).sort()).toEqual([
      "later",
      "ongoing",
      "soon",
      "unknown",
    ]);
    expect(offers.map((o) => o.id)).not.toContain("expired");
    expect(offers.map((o) => o.id)).not.toContain("future");
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
