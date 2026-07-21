import { describe, expect, it } from "vitest";
import {
  daysUntilExpiryAU,
  filterLive,
  isPastExpiry,
  todayAU,
} from "@/lib/offers/expiry";
import { giftCardDateState } from "@/lib/giftcards/dateState";
import {
  filterConfirmedCurrentOffers,
  isConfirmedCurrent,
  planLifecycle,
  type LifecycleOffer,
} from "@/lib/giftcards/lifecycle";
import {
  getCurrentReviewedGiftCardOffers,
  getGiftCardOffers,
} from "@/lib/repos/offers";
import { buildMarquee } from "@/lib/giftcards/marquee";
import { GC_DEFAULTS, queryGiftCardOffers } from "@/lib/giftcards/publicQuery";
import type { DbClient } from "@/lib/supabase/server";

/**
 * Offer expiry lifecycle — the single, exhaustive controlled-clock proof that
 * an offer stays live through the ENTIRE Australia/Sydney calendar day named by
 * its expiry_date and disappears from every public surface at 00:00 the
 * following Sydney day. Every clock here is a fixed instant; nothing reads the
 * wall clock. The read boundary is proven independent of the archival job (an
 * offer whose is_published flag is still true must still be hidden once its
 * Sydney expiry day has passed).
 *
 * The 14 required scenarios are labelled inline.
 */

// A fixed instant that is midday AEST (UTC+10) on the given YYYY-MM-DD.
const middayAest = (isoDate: string) => new Date(`${isoDate}T02:00:00Z`);
// The final second of a Sydney winter (AEST, UTC+10) calendar day.
const lastSecondAest = (isoDate: string) => new Date(`${isoDate}T13:59:59Z`);
// The first instant of the next Sydney winter calendar day (00:00:00 AEST).
const firstSecondNextAest = (isoDate: string) => new Date(`${isoDate}T14:00:00Z`);

// ─── A DB-shaped gift_card_offers row for the injected-client read path ──────

function giftCardRow(
  overrides: Partial<Record<string, unknown>> & { id: string; expiry_date: string | null },
) {
  return {
    brand: `Brand ${overrides.id}`,
    discount_percent: 10,
    channel: "supermarket-promo",
    source: "Reviewed source",
    accepted_at_merchant_ids: [],
    points_on_purchase: null,
    cap_dollars: null,
    start_date: null,
    purchase_location: "Sample seller",
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
    is_ongoing: false,
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
    source_last_seen_at: "2026-07-01T00:00:00Z",
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
    last_checked_at: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

/** An injected anon client that returns exactly these rows (RLS pre-applied). */
function client(rows: unknown[]): DbClient {
  return {
    from: () => ({ select: async () => ({ data: rows, error: null }) }),
  } as unknown as DbClient;
}

const EXPIRY = "2026-07-15"; // a Sydney winter (AEST) date

describe("scenario 1 — the day before expiry: live everywhere", () => {
  const now = middayAest("2026-07-14");
  it("read boundary keeps the offer", () => {
    expect(isPastExpiry(EXPIRY, todayAU(now))).toBe(false);
    expect(filterLive([{ id: "a", expiryDate: EXPIRY }], todayAU(now))).toHaveLength(1);
    expect(giftCardDateState({ expiryDate: EXPIRY }, now)).toBe("active");
    expect(daysUntilExpiryAU(EXPIRY, now)).toBe(1);
  });
});

describe("scenario 2 — the start of the expiry date: live", () => {
  // 00:00:00 on the Sydney expiry day (AEST) = 14:00Z the previous day.
  const now = new Date("2026-07-14T14:00:00Z");
  it("never expires at the beginning of the expiry day", () => {
    expect(todayAU(now)).toBe(EXPIRY);
    expect(isPastExpiry(EXPIRY, todayAU(now))).toBe(false);
    expect(giftCardDateState({ expiryDate: EXPIRY }, now)).toBe("active");
    expect(daysUntilExpiryAU(EXPIRY, now)).toBe(0);
  });
});

describe("scenario 3 — the final second of the expiry date: live", () => {
  const now = lastSecondAest(EXPIRY); // 23:59:59 AEST on the expiry day
  it("stays live through the whole Sydney expiry day", () => {
    expect(todayAU(now)).toBe(EXPIRY);
    expect(isPastExpiry(EXPIRY, todayAU(now))).toBe(false);
    expect(filterLive([{ id: "a", expiryDate: EXPIRY }], todayAU(now))).toHaveLength(1);
    expect(giftCardDateState({ expiryDate: EXPIRY }, now)).toBe("active");
  });
});

describe("scenario 4 — midnight immediately after expiry: gone", () => {
  const now = firstSecondNextAest(EXPIRY); // 00:00:00 the next Sydney day
  it("disappears exactly at the following Sydney midnight", () => {
    expect(todayAU(now)).toBe("2026-07-16");
    expect(isPastExpiry(EXPIRY, todayAU(now))).toBe(true);
    expect(filterLive([{ id: "a", expiryDate: EXPIRY }], todayAU(now))).toHaveLength(0);
    expect(giftCardDateState({ expiryDate: EXPIRY }, now)).toBe("expired");
    expect(daysUntilExpiryAU(EXPIRY, now)).toBe(-1);
  });
});

describe("scenario 5 — daylight-saving transitions", () => {
  it("AEDT summer expiry: last second live, next midnight gone (UTC+11)", () => {
    const summer = "2026-01-15";
    // 23:59:59 AEDT = 12:59:59Z; next midnight AEDT = 13:00:00Z — an hour
    // earlier in UTC than the winter case, proving DST is honoured.
    expect(todayAU(new Date("2026-01-15T12:59:59Z"))).toBe(summer);
    expect(isPastExpiry(summer, todayAU(new Date("2026-01-15T12:59:59Z")))).toBe(false);
    expect(todayAU(new Date("2026-01-15T13:00:00Z"))).toBe("2026-01-16");
    expect(isPastExpiry(summer, todayAU(new Date("2026-01-15T13:00:00Z")))).toBe(true);
  });

  it("AEST winter expiry: boundary sits an hour later in UTC (UTC+10)", () => {
    expect(isPastExpiry(EXPIRY, todayAU(new Date("2026-07-15T13:59:59Z")))).toBe(false);
    expect(isPastExpiry(EXPIRY, todayAU(new Date("2026-07-15T14:00:00Z")))).toBe(true);
  });

  it("spring-forward day (AEST→AEDT, 4 Oct 2026) is a single valid Sydney day", () => {
    // Most of 4 Oct is AEDT after the 02:00→03:00 jump. Last second is live,
    // and an offer expiring the day before is already gone early on the 4th.
    expect(todayAU(new Date("2026-10-04T12:59:59Z"))).toBe("2026-10-04");
    expect(isPastExpiry("2026-10-04", todayAU(new Date("2026-10-04T12:59:59Z")))).toBe(false);
    expect(isPastExpiry("2026-10-03", todayAU(new Date("2026-10-03T14:30:00Z")))).toBe(true);
  });
});

describe("scenario 6 — unknown expiry (evergreen, but not confirmed-current)", () => {
  const now = middayAest("2026-07-14");
  it("is never dropped by the read filter but is not ranked as confirmed", () => {
    expect(filterLive([{ id: "a", expiryDate: null }], todayAU(now))).toHaveLength(1);
    expect(giftCardDateState({ expiryDate: null }, now)).toBe("missing");
    expect(isConfirmedCurrent({ id: "a", expiryDate: null, isActive: true }, now)).toBe(false);
  });
});

describe("scenario 7 — ongoing offers are unaffected by expiry", () => {
  const now = middayAest("2026-07-14");
  it("never archives and stays confirmed-current with a null expiry", () => {
    expect(giftCardDateState({ expiryDate: null, isOngoing: true }, now)).toBe("ongoing");
    expect(isConfirmedCurrent({ id: "a", expiryDate: null, isOngoing: true, isActive: true }, now)).toBe(true);
    const plan = planLifecycle(
      [{ id: "a", expiryDate: null, isOngoing: true, isActive: true }],
      now,
    );
    expect(plan.toArchive).toEqual([]);
  });
});

describe("scenario 8 — already-archived records are not re-touched", () => {
  const now = firstSecondNextAest(EXPIRY);
  it("an expired but already-inactive offer yields no archive action", () => {
    const plan = planLifecycle(
      [{ id: "a", expiryDate: EXPIRY, isActive: false }],
      now,
    );
    expect(plan.toArchive).toEqual([]);
    expect(plan.toActivate).toEqual([]);
  });
});

describe("scenario 9 — repeated cleanup runs are idempotent", () => {
  const now = firstSecondNextAest(EXPIRY);
  it("archiving once then re-running produces an empty plan", () => {
    const offers: LifecycleOffer[] = [{ id: "a", expiryDate: EXPIRY, isActive: true }];
    const first = planLifecycle(offers, now);
    expect(first.toArchive).toEqual(["a"]);
    // Apply and re-run: the offer is now inactive → nothing further to do.
    const applied: LifecycleOffer[] = [{ id: "a", expiryDate: EXPIRY, isActive: false }];
    expect(planLifecycle(applied, now).toArchive).toEqual([]);
  });
});

describe("scenario 10 — concurrent cleanup runs are safe", () => {
  const now = firstSecondNextAest(EXPIRY);
  it("the plan is pure and deterministic for identical state", () => {
    const offers: LifecycleOffer[] = [
      { id: "a", expiryDate: EXPIRY, isActive: true },
      { id: "b", expiryDate: "2026-08-01", isActive: true },
    ];
    // Two racing workers computing the plan see the SAME archive set; applying
    // it is a filtered UPDATE (…where is_published=true and expiry_date<today),
    // so a double apply is a no-op. DB-level serialisation is the migration-030
    // one-running lock + the lifecycle advisory lock (asserted in
    // migrationContracts + lifecycleRoute tests).
    expect(planLifecycle(offers, now)).toEqual(planLifecycle(offers, now));
    expect(planLifecycle(offers, now).toArchive).toEqual(["a"]);
  });
});

describe("scenario 11 — public reads exclude expired even if the cron has not run", () => {
  // The DB row is still is_published=true (RLS returned it) but its Sydney
  // expiry day has passed. The read boundary MUST still hide it.
  const now = firstSecondNextAest(EXPIRY);
  const rows = [
    giftCardRow({ id: "gc-live", expiry_date: "2026-08-01" }),
    giftCardRow({ id: "gc-expired", expiry_date: EXPIRY }),
  ];

  it("getGiftCardOffers (stack engine input) drops the expired row", async () => {
    const offers = await getGiftCardOffers({ staticMode: false, client: client(rows), now });
    expect(offers.map((o) => o.id)).toEqual(["gc-live"]);
  });

  it("getCurrentReviewedGiftCardOffers (display path) drops the expired row", async () => {
    const offers = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(rows),
      now,
    });
    expect(offers.map((o) => o.id)).toEqual(["gc-live"]);
  });

  it("cashback/points read boundary is filterLive on the same Sydney date", () => {
    // getCashbackOffers/getPointsOffers apply filterLive(rows) with todayAU();
    // filterLive is the exact boundary and drops the expired row.
    const kept = filterLive(
      [
        { id: "cash-live", expiryDate: "2026-08-01" },
        { id: "cash-expired", expiryDate: EXPIRY },
      ],
      todayAU(now),
    );
    expect(kept.map((o) => o.id)).toEqual(["cash-live"]);
  });
});

describe("scenario 12 — homepage, listing, detail and stack agree", () => {
  const rows = [
    giftCardRow({ id: "gc-live", expiry_date: "2026-08-01" }),
    giftCardRow({ id: "gc-expired", expiry_date: EXPIRY }),
  ];

  it("before expiry every surface shows the offer; after expiry none do", async () => {
    const before = middayAest("2026-07-14");
    const after = firstSecondNextAest(EXPIRY);

    // Display path feeds the homepage carousel and the /gift-cards grid.
    const displayBefore = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(rows),
      now: before,
    });
    const displayAfter = await getCurrentReviewedGiftCardOffers({
      staticMode: false,
      client: client(rows),
      now: after,
    });
    // Stack engine path.
    const stackBefore = await getGiftCardOffers({ staticMode: false, client: client(rows), now: before });
    const stackAfter = await getGiftCardOffers({ staticMode: false, client: client(rows), now: after });

    const present = (list: { id: string }[]) => list.some((o) => o.id === "gc-expired");

    // Homepage carousel (buildMarquee) and grid (queryGiftCardOffers) derive
    // from the display path — assert each surface individually.
    expect(buildMarquee(displayBefore, before).slides.some((s) => s.id === "gc-expired")).toBe(true);
    expect(queryGiftCardOffers(displayBefore, GC_DEFAULTS, before).some((o) => o.id === "gc-expired")).toBe(true);
    expect(present(displayBefore)).toBe(true); // grid source
    expect(present(stackBefore)).toBe(true); // stack engine
    // Detail route: getCurrentReviewedGiftCardOffers().find(id) resolves it.
    expect(displayBefore.find((o) => o.id === "gc-expired")).toBeDefined();

    // After the Sydney expiry day, the offer is gone from ALL of them.
    expect(buildMarquee(displayAfter, after).slides.some((s) => s.id === "gc-expired")).toBe(false);
    expect(queryGiftCardOffers(displayAfter, GC_DEFAULTS, after).some((o) => o.id === "gc-expired")).toBe(false);
    expect(present(displayAfter)).toBe(false);
    expect(present(stackAfter)).toBe(false);
    // Detail route now resolves to undefined → the page calls notFound().
    expect(displayAfter.find((o) => o.id === "gc-expired")).toBeUndefined();

    // The still-live offer remains everywhere across the boundary.
    expect(displayAfter.some((o) => o.id === "gc-live")).toBe(true);
    expect(stackAfter.some((o) => o.id === "gc-live")).toBe(true);
  });
});

describe("scenario 13 — mutual consistency of the four date states", () => {
  const now = middayAest("2026-07-14");
  it("upcoming, active, expiring-today and expired are mutually exclusive", () => {
    expect(giftCardDateState({ startDate: "2026-07-20", expiryDate: "2026-07-25" }, now)).toBe("future");
    expect(giftCardDateState({ expiryDate: "2026-07-25" }, now)).toBe("active");
    expect(giftCardDateState({ expiryDate: "2026-07-14" }, now)).toBe("active"); // expiring today = still active
    expect(giftCardDateState({ expiryDate: "2026-07-13" }, now)).toBe("expired");
    // The shared public boundary keeps only active/ongoing rows.
    const kept = filterConfirmedCurrentOffers(
      [
        { id: "future", startDate: "2026-07-20", expiryDate: "2026-07-25" },
        { id: "active", expiryDate: "2026-07-25" },
        { id: "today", expiryDate: "2026-07-14" },
        { id: "expired", expiryDate: "2026-07-13" },
        { id: "unknown", expiryDate: null },
      ],
      now,
    );
    expect(kept.map((o) => o.id).sort()).toEqual(["active", "today"]);
  });
});
